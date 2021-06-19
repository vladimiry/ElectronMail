import electronLog from "electron-log";
import {concatMap, first} from "rxjs/operators";
import {session as electronSession} from "electron";
import {from, lastValueFrom, race, throwError, timer} from "rxjs";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "./model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {LoginFieldContainer} from "src/shared/model/container";
import {ONE_SECOND_MS, PACKAGE_NAME} from "src/shared/constants";
import {curryFunctionMembers, getRandomInt, getWebViewPartition} from "src/shared/util";
import {filterProtonSessionTokenCookies} from "src/electron-main/util";
import {initWebRequestListenersByAccount} from "src/electron-main/web-request";
import {registerSessionProtocols} from "src/electron-main/protocol";

type Session = import("electron").Session /* & { _documentCookieJar_?: import("tough-cookie").CookieJar } */;

const _logger = curryFunctionMembers(electronLog, __filename);

// TODO move "usedSessions" prop to "ctx"
// TODO remove the session from map on account removing
const createdSessions = new Map<string, Session>();

export function resolveInitializedSession({login}: DeepReadonly<LoginFieldContainer>): Session {
    const session = createdSessions.get(getWebViewPartition(login));
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
    const logger = curryFunctionMembers(_logger, nameof(initSession));

    if (rotateUserAgent) {
        if (!ctx.userAgentsPool || !ctx.userAgentsPool.length) {
            const config = await lastValueFrom(ctx.config$.pipe(first()));
            const {userAgents} = config;
            ctx.userAgentsPool = [...userAgents];
        }
        const {userAgentsPool} = ctx;
        if (userAgentsPool.length) {
            const idx = getRandomInt(0, userAgentsPool.length - 1);
            const userAgent = userAgentsPool[idx];
            if (!userAgent) {
                throw new Error("Invalid/empty user agent value (check the config.json file)");
            }
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

    // TODO electron built-in spellcheck: drop dictionaries load preventing hack
    // passing a non-resolving URL is a workaround, see https://github.com/electron/electron/issues/22995
    session.setSpellCheckerDictionaryDownloadURL("https://00.00/");
}

export async function configureSessionByAccount(
    ctx: DeepReadonly<Context>,
    account: DeepReadonly<AccountConfig>,
): Promise<void> {
    _logger.info(nameof(configureSessionByAccount));

    const {proxy} = account;
    const session = resolveInitializedSession({login: account.login});
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

    initWebRequestListenersByAccount(ctx, account);

    await lastValueFrom(
        race(
            from(
                session.setProxy(proxyConfig),
            ),
            timer(ONE_SECOND_MS * 2).pipe(
                concatMap(() => throwError(new Error("Failed to configure proxy settings"))),
            ),
        ),
    );
}

export async function initSessionByAccount(
    ctx: DeepReadonly<StrictOmit<Context, "userAgentsPool">> & Pick<Context, "userAgentsPool">,
    // eslint-disable-next-line max-len
    account: DeepReadonly<AccountConfig>,
): Promise<void> {
    const logger = curryFunctionMembers(_logger, nameof(initSessionByAccount));

    logger.info();

    const partition = getWebViewPartition(account.login);

    if (createdSessions.has(partition)) {
        return;
    }

    // TODO make user "electron.session.fromPartition" called once per "partition" across all the code
    const session = electronSession.fromPartition(partition);

    createdSessions.set(partition, session);

    await initSession(ctx, session, {rotateUserAgent: account.rotateUserAgent});
    await registerSessionProtocols(ctx, session);
    await configureSessionByAccount(ctx, account);

    {
        type Cause = "explicit" | "overwrite" | "expired" | "evicted" | "expired-overwrite";

        const skipCauses: ReadonlyArray<Cause> = ["expired", "evicted", "expired-overwrite"];

        session.cookies.on(
            "changed",
            // TODO electron/TS: drop explicit callback args typing (currently typed as Function in electron.d.ts)
            (...[, cookie, cause, removed]: [
                event: unknown,
                cookie: Electron.Cookie,
                cause: "explicit" | "overwrite" | "expired" | "evicted" | "expired-overwrite",
                removed: boolean
            ]) => {
                if (removed || skipCauses.includes(cause)) {
                    return;
                }

                const protonSessionTokenCookies = filterProtonSessionTokenCookies([cookie]);

                if (protonSessionTokenCookies.accessTokens.length || protonSessionTokenCookies.refreshTokens.length) {
                    logger.verbose("proton session token cookies modified");

                    IPC_MAIN_API_NOTIFICATION$.next(
                        IPC_MAIN_API_NOTIFICATION_ACTIONS.ProtonSessionTokenCookiesModified({key: {login: account.login}}),
                    );
                }
            },
        );
    }
}

export function getDefaultSession(): Session {
    const {defaultSession} = electronSession;

    if (!defaultSession) {
        throw new Error(`"session.defaultSession" is not defined`);
    }

    return defaultSession;
}
