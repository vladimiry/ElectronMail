// TODO enabel "tslint:await-promise" rule
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
} from "../shared/constants";
import {catchError, CONF, ENV, initApp, test, workflow} from "./workflow";
import {AccountType} from "../shared/model/account";

test.beforeEach(async (t) => {
    try {
        await initApp(t, {initial: true});
    } catch (error) {
        await catchError(t, error);
    }
});

test.afterEach(async (t) => {
    try {
        await workflow.destroyApp(t);
    } catch (error) {
        await catchError(t, error);
    }
});

test("login, add account, logout, auto login", async (t) => {
    await (async () => {
        const client = t.context.app.client;
        let accountsCount = 0;

        await workflow.login(t, {setup: true, savePassword: false});

        await workflow.addAccount(t, {type: "protonmail"});
        accountsCount++;

        await workflow.addAccount(t, {type: "tutanota"});
        accountsCount++;

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
            if (!login || !password) {
                continue;
            }

            await workflow.addAccount(t, {type, login, password, twoFactorCode});
            accountsCount++;

            await workflow.selectAccount(t, accountsCount - 1);

            if (unread && !isNaN(unread)) {
                await client.pause(ONE_SECOND_MS * 15);

                const verify = async (forceCheck = false) => {
                    // tslint:disable-next-line:max-line-length
                    const actualUnreadText = String(await client.getText(`.list-group.accounts-list > .list-group-item:nth-child(${accountsCount}) email-securely-app-account-title > .account-value-sync-unread > .badge`));
                    const actualUnread = Number(actualUnreadText.replace(/\D/g, ""));
                    const result = actualUnread >= unread;

                    if (result || forceCheck) {
                        t.true(actualUnread >= unread, `actualUnread(${actualUnread}) >= unread(${unread})`);
                    }

                    return result;
                };

                if (!(await verify())) {
                    await client.pause(ONE_SECOND_MS * (type === "tutanota" ? 70 : 10));
                    await verify(true);
                }
            }
        }

        await workflow.logout(t);
        await workflow.login(t, {setup: false, savePassword: true});
        t.is(
            (await client.getUrl()).split("#").pop(), "/(accounts-outlet:accounts)",
            `login: "accounts" page url`,
        );
        t.is(await workflow.accountsCount(t), accountsCount);

        await workflow.destroyApp(t);
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
