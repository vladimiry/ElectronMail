// TODO enable "tslint:await-promise" rule when spectron gets proper declaration files (all async methods return promises)
// tslint:disable:await-promise

import fs from "fs";
import path from "path";
import {promisify} from "util";

import {
    ONE_SECOND_MS,
    RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE,
    RUNTIME_ENV_E2E_PROTONMAIL_LOGIN,
    RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD,
    RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN,
    RUNTIME_ENV_E2E_TUTANOTA_2FA_CODE,
    RUNTIME_ENV_E2E_TUTANOTA_LOGIN,
    RUNTIME_ENV_E2E_TUTANOTA_PASSWORD,
    RUNTIME_ENV_E2E_TUTANOTA_UNREAD_MIN,
} from "src/shared/constants";
import {accountBadgeCssSelector, ENV, initApp, test} from "./workflow";
import {AccountType} from "src/shared/model/account";

const {CI} = process.env;

test.serial("general actions: app start, master password setup, add accounts, logout, auto login", async (t) => {
    // setup and login
    await (async () => {
        const workflow = await initApp(t, {initial: true});

        // setup and logout
        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({type: "protonmail"});
        await workflow.addAccount({type: "tutanota"});
        await workflow.logout();

        // login with password saving
        await workflow.login({setup: false, savePassword: true});
        await workflow.afterLoginUrlTest("explicit-login-passwordSave");
        await workflow.destroyApp();
    })();

    // auto login 1
    await (async () => {
        const workflow = await initApp(t, {initial: false});
        await workflow.afterLoginUrlTest(("auto-login-1"));
        await workflow.destroyApp();
    })();

    // auto login 2, making sure previous auto login step didn't remove saved password
    await (async () => {
        const workflow = await initApp(t, {initial: false});
        await workflow.afterLoginUrlTest(("auto-login-2"));
        await workflow.logout();
        await workflow.destroyApp();
    })();

    // making sure log file has not been created (no errors happened)
    t.false(fs.existsSync(t.context.logFilePath), `"${t.context.logFilePath}" file should not exist`);

    // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
    const rawSettings = promisify(fs.readFile)(path.join(t.context.userDataDirPath, "settings.bin"));
    t.true(rawSettings.toString().indexOf(ENV.loginPrefix) === -1);
});

for (const {type, login, password, twoFactorCode, unread} of ([
    {
        type: "protonmail",
        login: process.env[RUNTIME_ENV_E2E_PROTONMAIL_LOGIN],
        password: process.env[RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD],
        twoFactorCode: process.env[RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE],
        unread: Number(process.env[RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN]),
    },
    {
        type: "tutanota",
        login: process.env[RUNTIME_ENV_E2E_TUTANOTA_LOGIN],
        password: process.env[RUNTIME_ENV_E2E_TUTANOTA_PASSWORD],
        twoFactorCode: process.env[RUNTIME_ENV_E2E_TUTANOTA_2FA_CODE],
        unread: Number(process.env[RUNTIME_ENV_E2E_TUTANOTA_UNREAD_MIN]),
    },
] as Array<{ type: AccountType, login: string, password: string, twoFactorCode: string, unread: number }>)) {
    if (!login || !password || !unread || isNaN(unread)) {
        continue;
    }

    test.serial(`unread check: ${type}`, async (t) => {
        const workflow = await initApp(t, {initial: true});
        const pauseMs = ONE_SECOND_MS * (type === "tutanota" ? (CI ? 80 : 40) : 20);
        const unreadBadgeSelector = accountBadgeCssSelector();
        const state: { parsedUnreadText?: string } = {};

        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({type, login, password, twoFactorCode});
        await workflow.selectAccount();

        await t.context.app.client.pause(pauseMs);

        try {
            try {
                state.parsedUnreadText = String(await t.context.app.client.getText(unreadBadgeSelector));
            } catch (e) {
                t.fail(`failed to locate DOM element by "${unreadBadgeSelector}" selector after the "${pauseMs}" milliseconds pause`);
                throw e;
            }

            const parsedUnread = Number(state.parsedUnreadText.replace(/\D/g, ""));
            t.true(parsedUnread >= unread, `parsedUnread(${parsedUnread}) >= unread(${unread})`);
        } finally {
            await workflow.destroyApp();
        }
    });
}
