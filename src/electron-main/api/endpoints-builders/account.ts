import electronLog from "electron-log";
import {equals, pick} from "remeda";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {configureSessionByAccount, initSessionByAccount} from "src/electron-main/session";
import {curryFunctionMembers, pickAccountStrict} from "src/shared/util";

const _logger = curryFunctionMembers(electronLog, "[electron-main/api/endpoints-builders/account]");

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints,
    | "addAccount"
    | "updateAccount"
    | "changeAccountOrder"
    | "toggleAccountDisabling"
    | "removeAccount">> {
    return {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async addAccount(
            {

                login,
                title,
                entryUrl,
                database,
                persistentSession,
                rotateUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
            },
        ) {
            const account: AccountConfig = {
                login,
                title,
                entryUrl,
                database,
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

            await initSessionByAccount(ctx, pick(account, ["login", "proxy", "rotateUserAgent", "entryUrl"]));

            return result;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async updateAccount(
            {
                login,
                title,
                entryUrl,
                database,
                persistentSession,
                rotateUserAgent,
                credentials,
                proxy,
                loginDelayUntilSelected,
                loginDelaySecondsRange,
            },
        ) {
            return ctx.settingsStoreQueue.q(async () => {
                const logger = curryFunctionMembers(_logger, "updateAccount()");

                logger.info();

                const settings = await ctx.settingsStore.readExisting();
                const account = pickAccountStrict(settings.accounts, {login});
                const {credentials: existingCredentials} = account;

                const shouldConfigureSession = (
                    account.entryUrl !== entryUrl
                    ||
                    !equals(account.proxy, proxy)
                );
                logger.info(JSON.stringify({shouldConfigureSession}));

                account.title = title;
                account.database = database;
                account.persistentSession = persistentSession;
                account.rotateUserAgent = rotateUserAgent;

                if (typeof entryUrl === "undefined") {
                    throw new Error('"entryUrl" is undefined');
                }
                account.entryUrl = entryUrl;

                if (credentials) {
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
                    await configureSessionByAccount(
                        ctx,
                        pick(account, ["login", "proxy", "entryUrl"]),
                    );
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
}
