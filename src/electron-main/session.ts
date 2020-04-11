import _logger from "electron-log";
import {Session, session as electronSession} from "electron";
import {concatMap, take} from "rxjs/operators";
import {from, race, throwError, timer} from "rxjs";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "./model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {LoginFieldContainer} from "src/shared/model/container";
import {ONE_SECOND_MS, PACKAGE_NAME} from "src/shared/constants";
import {curryFunctionMembers, getRandomInt, getWebViewPartition} from "src/shared/util";
import {initWebRequestListeners} from "src/electron-main/web-request";
import {registerSessionProtocols} from "src/electron-main/protocol";

const logger = curryFunctionMembers(_logger, "[src/electron-main/session]");

// TODO move "usedPartitions" prop to "ctx"
// eslint-disable-next-line @typescript-eslint/no-use-before-define
const usedPartitions: Set<Parameters<typeof initSessionByAccount>[1]["login"]> = new Set();

// TODO move "usedSessions" prop to "ctx"
// TODO remove the session from map on account removing
const usedSessions: Map<string, Session> = new Map();

export function resolveInitialisedSession({login}: LoginFieldContainer): Session {
    const session = usedSessions.get(getWebViewPartition(login));
    if (!session) {
        throw new Error(`Failed to resolve account session`);
    }
    return session;
}

function purifyUserAgentHeader(session: Session): void {
    const appNameRe = new RegExp(`${PACKAGE_NAME}[\\/\\S]+`, "i");
    const electronRe = new RegExp("electron", "i");
    const currentUserAgent = String(session.getUserAgent());
    const purifiedUserAgent = currentUserAgent
        .split(appNameRe)
        .join("")
        .split(/\s+/)
        .filter((chunk) => !electronRe.exec(chunk))
        .join(" ");

    session.setUserAgent(purifiedUserAgent);
}

export async function initSession(
    ctx: DeepReadonly<StrictOmit<Context, "userAgentsPool">> & Pick<Context, "userAgentsPool">,
    session: Session,
    {rotateUserAgent}: DeepReadonly<Partial<Pick<AccountConfig, "rotateUserAgent">>> = {},
): Promise<void> {
    if (rotateUserAgent) {
        if (!ctx.userAgentsPool || !ctx.userAgentsPool.length) {
            const {userAgents} = await ctx.config$
                .pipe(take(1))
                .toPromise();
            ctx.userAgentsPool = [...userAgents];
        }
        const {userAgentsPool} = ctx;
        if (userAgentsPool.length) {
            const idx = getRandomInt(0, userAgentsPool.length - 1);
            const userAgent = userAgentsPool[idx];
            logger.info("picked user agent to set", JSON.stringify({idx, userAgent, userAgentsPoolSize: userAgentsPool.length}));
            userAgentsPool.splice(idx, 1); // removing used value from the pool
            session.setUserAgent(userAgent);
        } else {
            const message = `Can't rotate the "session.userAgent" since user agents pool is empty`;
            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.InfoMessage({message}),
            );
            logger.warn(message);
        }
    }
    purifyUserAgentHeader(session);
    await registerSessionProtocols(ctx, session);
    initWebRequestListeners(ctx, session);
}

export async function configureSessionByAccount(
    account: DeepReadonly<Pick<AccountConfig, "login" | "proxy">>,
): Promise<void> {
    const {proxy} = account;
    const session = resolveInitialisedSession({login: account.login});
    const proxyConfig = {
        ...{
            pacScript: "",
            proxyRules: "",
            proxyBypassRules: "",
        },
        ...(proxy && proxy.proxyRules && proxy.proxyRules.trim() && {
            proxyRules: proxy.proxyRules.trim(),
            proxyBypassRules: (proxy.proxyBypassRules && proxy.proxyRules.trim()) || "",
        }),
    };

    return race(
        from(
            session.setProxy(proxyConfig),
        ),
        timer(ONE_SECOND_MS * 2).pipe(
            concatMap(() => throwError(new Error("Failed to configure proxy settings"))),
        ),
    ).toPromise();
}

export async function initSessionByAccount(
    ctx: DeepReadonly<StrictOmit<Context, "userAgentsPool">> & Pick<Context, "userAgentsPool">,
    account: DeepReadonly<Pick<AccountConfig, "login" | "proxy" | "rotateUserAgent">>,
): Promise<void> {
    const partition = getWebViewPartition(account.login);

    if (usedPartitions.has(partition)) {
        return;
    }

    // TODO make user "electron.session.fromPartition" called once per "partition" across all the code
    const session = electronSession.fromPartition(partition);

    usedSessions.set(partition, session);

    await initSession(ctx, session, {rotateUserAgent: account.rotateUserAgent});
    await configureSessionByAccount(account);

    usedPartitions.add(partition);
}

export function getDefaultSession(): Session {
    const {defaultSession} = electronSession;

    if (!defaultSession) {
        throw new Error(`"session.defaultSession" is not defined`);
    }

    return defaultSession;
}
