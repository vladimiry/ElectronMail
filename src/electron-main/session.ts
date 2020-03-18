import {Session, session as electronSession} from "electron";
import {concatMap} from "rxjs/operators";
import {from, race, throwError, timer} from "rxjs";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "./model";
import {LoginFieldContainer} from "src/shared/model/container";
import {ONE_SECOND_MS, PACKAGE_NAME} from "src/shared/constants";
import {getWebViewPartition} from "src/shared/util";
import {initWebRequestListeners} from "src/electron-main/web-request";
import {registerSessionProtocols} from "src/electron-main/protocol";

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const usedPartitions: Set<Parameters<typeof initSessionByAccount>[1]["login"]> = new Set();

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
    ctx: Context,
    session: Session,
): Promise<void> {
    purifyUserAgentHeader(session);
    await registerSessionProtocols(ctx, session);
    initWebRequestListeners(ctx, session);
}

export async function configureSessionByAccount(
    account: Pick<AccountConfig, "login" | "proxy">,
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
    ctx: Context,
    account: Pick<AccountConfig, "login" | "proxy">,
): Promise<void> {
    const partition = getWebViewPartition(account.login);

    if (usedPartitions.has(partition)) {
        return;
    }

    // TODO make user "electron.session.fromPartition" called once per "partition" across all the code
    const session = electronSession.fromPartition(partition);

    usedSessions.set(partition, session);

    await initSession(ctx, session);
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

