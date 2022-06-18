import {concatMap, first} from "rxjs/operators";
import electronLog from "electron-log";
import {session as electronSession, Session} from "electron";
import {from, lastValueFrom, race, throwError, timer} from "rxjs";
import {keys} from "ts-transformer-keys";
import {omit} from "remeda";

import type {AccountConfig} from "src/shared/model/account";
import type {AccountSessionAppData, Context} from "./model";
import {curryFunctionMembers} from "src/shared/util";
import {filterProtonSessionApplyingCookies, getPurifiedUserAgent, getUserAgentByAccount} from "src/electron-main/util";
import {getWebViewPartitionName} from "src/shared/util/proton-webclient";
import {initWebRequestListenersByAccount} from "src/electron-main/web-request";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {ONE_SECOND_MS} from "src/shared/const";
import {PLATFORM} from "src/electron-main/constants";
import {PROTON_API_ENTRY_URLS} from "src/shared/const/proton-url";
import {registerAccountSessionProtocols} from "src/electron-main/protocol";

const _logger = curryFunctionMembers(electronLog, __filename);

type createSessionUtilType = {
    readonly create: (partition: string) => Session & Partial<Pick<AccountSessionAppData, "_electron_mail_data_">>;
    readonly createdBefore: (partition: string) => boolean
    readonly fromPartition: (partition: string) => Session & Pick<AccountSessionAppData, "_electron_mail_reset_counter_">;
};

export const createSessionUtil: createSessionUtilType = (() => {
    type ResultType = createSessionUtilType;
    const existingPartitions: Set<string> = new Set();
    const persistentSessionErrorMessage = "Persistent sessions are not allowed.";
    const createdBefore: ResultType["createdBefore"] = (partition) => {
        _logger.info(nameof.full(createSessionUtil.createdBefore));
        return existingPartitions.has(partition);
    };
    const fromPartition: ResultType["fromPartition"] = (partition) => {
        _logger.info(nameof.full(createSessionUtil.fromPartition));
        const session = electronSession.fromPartition(partition, {cache: false});
        if (!existingPartitions.has(partition)) {
            existingPartitions.add(partition);
        }
        return session;
    };
    const create: ResultType["create"] = (partition) => {
        _logger.info(nameof.full(createSessionUtil.create));

        if (String(partition).trim().toLowerCase().startsWith("persist:")) {
            throw new Error(persistentSessionErrorMessage);
        }

        const session = fromPartition(partition);

        if (session.isPersistent()) {
            throw new Error(persistentSessionErrorMessage);
        }

        {
            const userAgentToSet = session.getUserAgent();
            const purifiedUserAgent = getPurifiedUserAgent(userAgentToSet);
            if (purifiedUserAgent !== userAgentToSet) {
                session.setUserAgent(purifiedUserAgent);
            }
        }

        // TODO electron built-in spellcheck: drop dictionaries load preventing hack
        // passing a non-resolving URL is a workaround, see https://github.com/electron/electron/issues/22995
        session.setSpellCheckerDictionaryDownloadURL("https://00.00/");

        return session;
    };
    return {
        create,
        createdBefore,
        fromPartition(partition: string): Session {
            if (!createdBefore(partition)) {
                throw new Error(`Session should be created via the "${nameof.full(createSessionUtil.create)}" call.`);
            }
            return fromPartition(partition);
        },
    };
})();

export const resolveInitializedAccountSession = (
    {login, entryUrl}: DeepReadonly<Pick<AccountConfig, "login" | "entryUrl">>,
): ReturnType<typeof createSessionUtil.fromPartition> => {
    return createSessionUtil.fromPartition(
        getWebViewPartitionName({login, entryUrl}),
    );
};

export const enableNetworkEmulationToAllAccountSessions = (
    {login}: DeepReadonly<Pick<AccountConfig, "login">>,
    value: "offline" | "online",
): void => {
    for (const entryUrl of PROTON_API_ENTRY_URLS) {
        // at this stage all the account session are supposed to be initialized (account sessions get initialized eagerly)
        const session = resolveInitializedAccountSession({login, entryUrl});
        session.enableNetworkEmulation({offline: value === "offline"});
    }
};

export const configureSessionByAccount = async (
    account: DeepReadonly<StrictOmit<AccountConfig, "entryUrl">>,
    {entryUrl}: DeepReadonly<Pick<AccountConfig, "entryUrl">>,
): Promise<void> => {
    _logger.info(nameof(configureSessionByAccount));

    const {proxy} = account;
    const session = resolveInitializedAccountSession({login: account.login, entryUrl});
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

    session.setUserAgent(getUserAgentByAccount({customUserAgent: account.customUserAgent}));
    initWebRequestListenersByAccount({...account, entryUrl});

    await lastValueFrom(
        race(
            from(
                session.setProxy(proxyConfig),
            ),
            timer(ONE_SECOND_MS * 2).pipe(
                concatMap(() => throwError(() => new Error("Failed to configure proxy settings"))),
            ),
        ),
    );
};

export const resetSessionStorages = async (
    ctx: DeepReadonly<Context>,
    {login, apiEndpointOrigin}: DeepReadonly<{ login: string, apiEndpointOrigin: string }>,
): Promise<void> => {
    const session = resolveInitializedAccountSession({login, entryUrl: apiEndpointOrigin});
    const config = await lastValueFrom(ctx.config$.pipe(first()));
    const {timeouts: {clearSessionStorageData: timeoutMs}} = config;

    // delete session._documentCookieJar_;

    await lastValueFrom(
        race(
            from(
                // TODO e2e / playwright: "session.clearStorageData()" hangs when executed e2e test flow on "win32" system
                BUILD_ENVIRONMENT === "e2e" && PLATFORM === "win32"
                    ? Promise.resolve()
                    : session.clearStorageData()
            ),
            timer(timeoutMs).pipe(
                concatMap(() => throwError(new Error(`Session clearing failed in ${timeoutMs}ms`))),
            ),
        ),
    );
};

export const initAccountSessions = async (
    ctx: DeepReadonly<Context>,
    account: DeepReadonly<StrictOmit<AccountConfig, "entryUrl">>,
): Promise<void> => {
    const logger = curryFunctionMembers(_logger, nameof(initAccountSessions));

    logger.info();

    // account sessions get initialized eagerly
    for (const entryUrl of PROTON_API_ENTRY_URLS) {
        const partition = getWebViewPartitionName({login: account.login, entryUrl});

        if (createSessionUtil.createdBefore(partition)) {
            // resetting the session to handle to case when account was removed and then added again
            // TODO drop the account's session on account removing instead of dropping the session's stores
            //      currently @electron doesn't support sessions removing
            await resetSessionStorages(ctx, {login: account.login, apiEndpointOrigin: entryUrl});
            continue;
        }

        const session = createSessionUtil.create(partition);

        session["_electron_mail_data_"] = {entryUrl};

        await registerAccountSessionProtocols(ctx, session as (typeof session & Required<Pick<typeof session, "_electron_mail_data_">>));
        await configureSessionByAccount(account, {entryUrl});

        {
            const causesToSkip: ReadonlyArray<Parameters<Parameters<typeof session.cookies.on>[1]>[2]>
                = ["expired", "evicted", "expired-overwrite"];
            const processedCookiesValueStrings: Record<keyof ReturnType<typeof filterProtonSessionApplyingCookies>, string>
                = {accessTokens: "", refreshTokens: "", sessionIds: ""};
            session.cookies.on(
                "changed",
                (...[, cookie, cause, removed]) => {
                    if (removed || causesToSkip.includes(cause)) {
                        return;
                    }
                    const cookies = filterProtonSessionApplyingCookies([cookie]);
                    for (const key of keys<typeof cookies>()) {
                        const cookiesValue = cookies[key];
                        if (!cookiesValue.length) {
                            continue;
                        }
                        const cookiesValueString = JSON.stringify(
                            cookiesValue.map((value) => omit(value, ["expirationDate"])),
                        );
                        if (cookiesValueString === processedCookiesValueStrings[key]) {
                            continue;
                        }
                        processedCookiesValueStrings[key] = cookiesValueString;
                        logger.verbose("proton session token cookies modified");
                        IPC_MAIN_API_NOTIFICATION$.next(
                            IPC_MAIN_API_NOTIFICATION_ACTIONS.ProtonSessionTokenCookiesModified({key: {login: account.login}}),
                        );
                        break;
                    }
                },
            );
        }
    }
};
