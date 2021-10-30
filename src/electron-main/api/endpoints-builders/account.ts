import electronLog from "electron-log";
import {equals} from "remeda";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {assertTypeOf, curryFunctionMembers, pickAccountStrict, validateExternalContentProxyUrlPattern} from "src/shared/util";
import {configureSessionByAccount, initSessionByAccount} from "src/electron-main/session";

const _logger = curryFunctionMembers(electronLog, __filename);

const assertEntryUrl = (value: string): void | never => {
    assertTypeOf({value, expectedType: "string"}, `Invalid "API entry point" value.`);
};

const assertExternalContentProxyUrlPattern = (
    arg: Pick<NoExtraProps<DeepReadonly<AccountConfig>>, "externalContentProxyUrlPattern" | "enableExternalContentProxy">,
): void | never => {
    if (!validateExternalContentProxyUrlPattern(arg)) {
        throw new Error(`Invalid "external content proxy URL pattern" value: "${String(arg.externalContentProxyUrlPattern)}"`);
    }
};

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints,
    | "addAccount"
    | "updateAccount"
    | "changeAccountOrder"
    | "toggleAccountDisabling"
    | "removeAccount">> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async addAccount(
            {
                login,
                customCSS,
                title,
                entryUrl,
                blockNonEntryUrlBasedRequests,
                externalContentProxyUrlPattern,
                enableExternalContentProxy,
                database,
                localStoreViewByDefault,
                persistentSession,
                rotateUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
            },
        ) {
            assertEntryUrl(entryUrl);
            assertExternalContentProxyUrlPattern({enableExternalContentProxy, externalContentProxyUrlPattern});

            const account: AccountConfig = {
                login,
                customCSS,
                title,
                entryUrl,
                blockNonEntryUrlBasedRequests,
                externalContentProxyUrlPattern,
                enableExternalContentProxy,
                database,
                localStoreViewByDefault,
                persistentSession,
                rotateUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
            };
            const result = await ctx.settingsStoreQueue.q(async () => {
                const settings = await ctx.settingsStore.readExisting();
                settings.accounts.push(account);
                return ctx.settingsStore.write(settings);
            });

            await initSessionByAccount(ctx, account);

            return result;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async updateAccount(
            {
                login,
                customCSS,
                title,
                entryUrl,
                blockNonEntryUrlBasedRequests,
                externalContentProxyUrlPattern,
                enableExternalContentProxy,
                database,
                localStoreViewByDefault,
                persistentSession,
                rotateUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
            },
        ) {
            assertEntryUrl(entryUrl);
            assertExternalContentProxyUrlPattern({enableExternalContentProxy, externalContentProxyUrlPattern});

            return ctx.settingsStoreQueue.q(async () => {
                const logger = curryFunctionMembers(_logger, nameof(endpoints.updateAccount));

                logger.info();

                const settings = await ctx.settingsStore.readExisting();
                const account = pickAccountStrict(settings.accounts, {login});

                const shouldConfigureSession = (
                    account.entryUrl !== entryUrl
                    ||
                    !equals(account.proxy, proxy)
                    ||
                    account.blockNonEntryUrlBasedRequests !== blockNonEntryUrlBasedRequests
                    ||
                    account.externalContentProxyUrlPattern !== externalContentProxyUrlPattern
                    ||
                    account.enableExternalContentProxy !== enableExternalContentProxy
                );
                logger.verbose(JSON.stringify({shouldConfigureSession}));

                account.customCSS = customCSS;
                account.title = title;
                account.database = database;
                account.localStoreViewByDefault = localStoreViewByDefault;
                account.persistentSession = persistentSession;
                account.rotateUserAgent = rotateUserAgent;
                account.entryUrl = entryUrl;
                account.blockNonEntryUrlBasedRequests = blockNonEntryUrlBasedRequests;
                account.externalContentProxyUrlPattern = externalContentProxyUrlPattern;
                account.enableExternalContentProxy = enableExternalContentProxy;

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

                account.proxy = proxy;
                account.loginDelayUntilSelected = loginDelayUntilSelected;
                account.loginDelaySecondsRange = loginDelaySecondsRange;

                if (shouldConfigureSession) {
                    await configureSessionByAccount(ctx, account);
                }

                return ctx.settingsStore.write(settings);
            });
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
