import {from} from "rxjs";
import {pick} from "ramda";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {configureSessionByAccount, initSessionByAccount} from "src/electron-main/session";
import {pickAccountStrict} from "src/shared/util";

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "addAccount" | "updateAccount" | "changeAccountOrder" | "removeAccount">> {
    return {
        addAccount: (
            {type, login, entryUrl, database, credentials, proxy, loginDelayOnSelect, loginDelaySecondsRange},
        ) => from((async () => {
            const account = {
                type,
                login,
                entryUrl,
                database,
                credentials,
                proxy,
                loginDelayOnSelect,
                loginDelaySecondsRange,
            } as AccountConfig; // TODO ger rid of "TS as" casting
            const settings = await ctx.settingsStore.readExisting();

            settings.accounts.push(account);

            const result = await ctx.settingsStore.write(settings);

            await initSessionByAccount(ctx, pick(["login", "proxy"], account), {skipClearSessionCaches: true});

            return result;
        })()),

        updateAccount: (
            {login, entryUrl, database, credentials, proxy, loginDelayOnSelect, loginDelaySecondsRange},
        ) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const account = pickAccountStrict(settings.accounts, {login});
            const {credentials: existingCredentials} = account;

            account.database = database;

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
                if (account.type === "protonmail" && "mailPassword" in credentials) {
                    account.credentials.mailPassword = credentials.mailPassword;
                }
            }

            account.proxy = proxy;
            await configureSessionByAccount(pick(["login", "proxy"], account));

            account.loginDelayOnSelect = loginDelayOnSelect;
            account.loginDelaySecondsRange = loginDelaySecondsRange;

            return await ctx.settingsStore.write(settings);
        })()),

        changeAccountOrder: ({login, index: moveToIndex}) => from((async () => {
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

            return await ctx.settingsStore.write(settings);
        })()),

        removeAccount: ({login}) => from((async () => {
            const settings = await ctx.settingsStore.readExisting();
            const account = pickAccountStrict(settings.accounts, {login});
            const index = settings.accounts.indexOf(account);

            settings.accounts.splice(index, 1);

            // TODO remove session, not yet supported by Electron?

            return await ctx.settingsStore.write(settings);
        })()),
    };
}
