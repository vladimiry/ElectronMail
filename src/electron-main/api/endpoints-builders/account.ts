import electronLog from "electron-log";
import {isDeepEqual} from "remeda";

import {AccountConfig} from "src/shared/model/account";
import {assertEntryUrl} from "src/electron-main/util";
import {configureSessionByAccount, enableNetworkEmulationToAllAccountSessions, initAccountSessions} from "src/electron-main/session";
import {Context} from "src/electron-main/model";
import {curryFunctionMembers, pickAccountStrict} from "src/shared/util";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {validateExternalContentProxyUrlPattern} from "src/shared/util/url";

const _logger = curryFunctionMembers(electronLog, __filename);

const assertExternalContentProxyUrlPattern = (
    arg: Pick<NoExtraProps<DeepReadonly<AccountConfig>>, "externalContentProxyUrlPattern" | "enableExternalContentProxy">,
): void | never => {
    if (!validateExternalContentProxyUrlPattern(arg)) {
        throw new Error(`Invalid "external content proxy URL pattern" value: "${String(arg.externalContentProxyUrlPattern)}"`);
    }
};

export async function buildEndpoints(
    ctx: Context,
): Promise<
    Pick<
        IpcMainApiEndpoints,
        | "addAccount"
        | "updateAccount"
        | "enableNetworkEmulationForAccountSessions"
        | "changeAccountOrder"
        | "toggleAccountDisabling"
        | "removeAccount"
    >
> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async addAccount(
            {
                login,
                customNotification,
                customNotificationCode,
                notificationShellExec,
                notificationShellExecCode,
                customCSS,
                title,
                entryUrl,
                blockNonEntryUrlBasedRequests,
                externalContentProxyUrlPattern,
                enableExternalContentProxy,
                database,
                localStoreViewByDefault,
                persistentSession,
                customUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
                entryProtonApp,
            },
        ) {
            assertEntryUrl(entryUrl);
            assertExternalContentProxyUrlPattern({enableExternalContentProxy, externalContentProxyUrlPattern});

            const account: AccountConfig = {
                login,
                customNotification,
                customNotificationCode,
                notificationShellExec,
                notificationShellExecCode,
                customCSS,
                title,
                entryUrl,
                blockNonEntryUrlBasedRequests,
                externalContentProxyUrlPattern,
                enableExternalContentProxy,
                database,
                localStoreViewByDefault,
                persistentSession,
                customUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
                entryProtonApp,
            };
            const result = await ctx.settingsStoreQueue.q(async () => {
                const settings = await ctx.settingsStore.readExisting();
                settings.accounts.push(account);
                return ctx.settingsStore.write(settings);
            });

            await initAccountSessions(ctx, account);

            return result;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async updateAccount(
            {
                login,
                customNotification,
                customNotificationCode,
                notificationShellExec,
                notificationShellExecCode,
                customCSS,
                title,
                entryUrl,
                blockNonEntryUrlBasedRequests,
                externalContentProxyUrlPattern,
                enableExternalContentProxy,
                database,
                localStoreViewByDefault,
                persistentSession,
                customUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
                entryProtonApp,
            },
        ) {
            assertEntryUrl(entryUrl);
            assertExternalContentProxyUrlPattern({enableExternalContentProxy, externalContentProxyUrlPattern});

            return ctx.settingsStoreQueue.q(async () => {
                const logger = curryFunctionMembers(_logger, nameof(endpoints.updateAccount));

                logger.info();

                const settings = await ctx.settingsStore.readExisting();
                const account = pickAccountStrict(settings.accounts, {login});
                const shouldConfigureSession = account.entryUrl !== entryUrl
                    || !isDeepEqual(account.proxy, proxy)
                    || account.blockNonEntryUrlBasedRequests !== blockNonEntryUrlBasedRequests
                    || account.externalContentProxyUrlPattern !== externalContentProxyUrlPattern
                    || account.enableExternalContentProxy !== enableExternalContentProxy
                    || account.customUserAgent !== customUserAgent;
                logger.verbose(JSON.stringify({shouldConfigureSession}));

                account.customNotification = customNotification;
                account.customNotificationCode = customNotificationCode;
                account.notificationShellExec = notificationShellExec;
                account.notificationShellExecCode = notificationShellExecCode;
                account.customCSS = customCSS;
                account.title = title;
                account.database = database;
                account.localStoreViewByDefault = localStoreViewByDefault;
                account.persistentSession = persistentSession;
                account.customUserAgent = customUserAgent;
                account.entryUrl = entryUrl;
                account.blockNonEntryUrlBasedRequests = blockNonEntryUrlBasedRequests;
                account.externalContentProxyUrlPattern = externalContentProxyUrlPattern;
                account.enableExternalContentProxy = enableExternalContentProxy;
                account.proxy = proxy;
                account.loginDelayUntilSelected = loginDelayUntilSelected;
                account.loginDelaySecondsRange = loginDelaySecondsRange;
                account.entryProtonApp = entryProtonApp;

                if (credentials) {
                    const {credentials: existingCredentials} = account;

                    if ("password" in credentials) {
                        existingCredentials.password = credentials.password;
                    }
                    if ("twoFactorCode" in credentials) {
                        existingCredentials.twoFactorCode = credentials.twoFactorCode;
                    }
                    if ("mailPassword" in credentials) {
                        account.credentials.mailPassword = credentials.mailPassword;
                    }
                }

                const updatedSettings = ctx.settingsStore.write(settings);

                if (shouldConfigureSession) {
                    await (await ctx.deferredEndpoints.promise).enableNetworkEmulationForAccountSessions({
                        login: account.login,
                        value: "offline",
                    });
                    await configureSessionByAccount(account, {entryUrl: account.entryUrl});
                }

                return updatedSettings;
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async enableNetworkEmulationForAccountSessions({login, value}) {
            enableNetworkEmulationToAllAccountSessions({login}, value);
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async changeAccountOrder({login, index: moveToIndex}) {
            return ctx.settingsStoreQueue.q(async () => {
                const settings = await ctx.settingsStore.readExisting();

                if (isNaN(moveToIndex) || moveToIndex < 0 || moveToIndex >= settings.accounts.length) {
                    throw new Error(`Invalid "index" value`);
                }

                const accountToMove = pickAccountStrict(settings.accounts, {login});
                const removeIndex = settings.accounts.indexOf(accountToMove);

                if (removeIndex === moveToIndex) {
                    return settings;
                }

                settings.accounts.splice(removeIndex, 1);
                settings.accounts.splice(moveToIndex, 0, accountToMove);

                return ctx.settingsStore.write(settings);
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async toggleAccountDisabling({login}) {
            return ctx.settingsStoreQueue.q(async () => {
                const settings = await ctx.settingsStore.readExisting();
                const account = pickAccountStrict(settings.accounts, {login});

                account.disabled = !account.disabled;

                return ctx.settingsStore.write(settings);
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async removeAccount({login}) {
            return ctx.settingsStoreQueue.q(async () => {
                const settings = await ctx.settingsStore.readExisting();
                const account = pickAccountStrict(settings.accounts, {login});
                const index = settings.accounts.indexOf(account);

                settings.accounts.splice(index, 1);

                // TODO remove session, not yet supported by Electron?

                return ctx.settingsStore.write(settings);
            });
        },
    };

    return endpoints;
}
