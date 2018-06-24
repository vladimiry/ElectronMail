// TODO enabel "tslint:await-promise" rule
// tslint:disable:await-promise

import fs from "fs";
import path from "path";
import {promisify} from "util";

import {actions, catchError, CONF, ENV, initApp, test} from "./util";

test.beforeEach(async (t) => {
    try {
        await initApp(t, {initial: true});
    } catch (error) {
        await catchError(t, error);
    }
});

test.afterEach(async (t) => {
    try {
        await actions.destroyApp(t);
    } catch (error) {
        await catchError(t, error);
    }
});

test("login, add account, logout, auto login", async (t) => {
    await (async () => {
        const client = t.context.app.client;
        let accountsCount = 0;

        await actions.login(t, {setup: true, savePassword: false});

        await actions.addAccount(t);
        accountsCount++;
        t.is(await actions.accountsCount(t), accountsCount);

        await (async () => {
            const login = (process.env.PROTONMAIL_DESKTOP_APP_E2E_ACC_LOGIN || "").trim();
            const password = (process.env.PROTONMAIL_DESKTOP_APP_E2E_ACC_PASSWORD || "").trim();
            const unread = Number(process.env.PROTONMAIL_DESKTOP_APP_E2E_ACC_UNREAD);

            if (!login || !password) {
                return;
            }

            await actions.addAccount(t, {login, password});
            accountsCount++;
            t.is(await actions.accountsCount(t), accountsCount);
            await actions.selectAccount(t, accountsCount - 1);

            if (unread && !isNaN(unread)) {
                await client.pause(10000);
                // tslint:disable-next-line:max-line-length
                const unreadText = String(await client.getText(`.list-group.accounts-list > .list-group-item:nth-child(${accountsCount}) protonmail-desktop-app-account-title > .account-value-sync-unread > .badge`));
                const actualUnread = Number(unreadText.replace(/\D/g, ""));
                t.true(actualUnread >= unread, `actualUnread(${actualUnread}) >= unread(${unread})`);
            }
        })();

        await actions.logout(t);
        await actions.login(t, {setup: false, savePassword: true});
        t.is(
            (await client.getUrl()).split("#").pop(), "/(accounts-outlet:accounts)",
            `login: "accounts" page url`,
        );
        t.is(await actions.accountsCount(t), accountsCount);

        await actions.destroyApp(t);
    })();

    await initApp(t, {initial: false});
    await t.context.app.client.pause(CONF.timeouts.transition + CONF.timeouts.encryption);

    t.is(
        (await t.context.app.client.getUrl()).split("#").pop(), "/(accounts-outlet:accounts)",
        `root: "accounts" page url`,
    );

    // making sure log file has not been created (no errors happened)
    t.false(fs.existsSync(t.context.logFilePath), `"${t.context.logFilePath}" file should not exist`);

    // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
    const rawSettings = promisify(fs.readFile)(path.join(t.context.userDataDirPath, "settings.bin"));
    t.true(rawSettings.toString().indexOf(ENV.loginPrefix) === -1);
});
