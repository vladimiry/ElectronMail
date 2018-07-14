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
} from "src/shared/constants";
import {ENV, initApp, test, workflow} from "./workflow";
import {AccountType} from "src/shared/model/account";

test("starting app / master password setup / add accounts / logout / auto login", async (t) => {
    await initApp(t, {initial: true});

    let accountsCount = 0;

    // initial setup and logout
    await (async () => {
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
                await t.context.app.client.pause(ONE_SECOND_MS * 15);

                const verify = async (requiredAssertion = false) => {
                    let actualUnreadText: string;

                    try {
                        // tslint:disable-next-line:max-line-length
                        actualUnreadText = String(await t.context.app.client.getText(`.list-group.accounts-list > .list-group-item:nth-child(${accountsCount}) email-securely-app-account-title > .account-value-sync-unread > .badge`));
                    } catch (e) {
                        if (!requiredAssertion) {
                            return false;
                        }
                        throw e;
                    }

                    const actualUnread = Number(actualUnreadText.replace(/\D/g, ""));
                    t.true(actualUnread >= unread, `actualUnread(${actualUnread}) >= unread(${unread})`);
                    return true;
                };

                if (!(await verify())) {
                    await t.context.app.client.pause(ONE_SECOND_MS * (type === "tutanota" ? 70 : 10));
                    await verify(true);
                }
            }
        }

        await workflow.logout(t);
    })();

    const afterLoginTest = async (workflowPrefix: string) => {
        t.is(
            (await t.context.app.client.getUrl()).split("#").pop(),
            "/(accounts-outlet:accounts)", `workflow.${workflowPrefix}: "accounts" page url`,
        );
        t.is(await workflow.accountsCount(t), accountsCount);
    };

    // login with password saving
    await workflow.login(t, {setup: false, savePassword: true});
    await afterLoginTest("explicit-login-passwordSave");
    await workflow.destroyApp(t);

    // auto login 1
    await initApp(t, {initial: false});
    await afterLoginTest("auto-login-1");
    await workflow.destroyApp(t);

    // auto login 2, making sure previous auto login step didn't remove saved password
    await initApp(t, {initial: false});
    await afterLoginTest("auto-login-2");
    await workflow.destroyApp(t); // final app instance is being destroyed by "afterEach" call

    // making sure log file has not been created (no errors happened)
    t.false(fs.existsSync(t.context.logFilePath), `"${t.context.logFilePath}" file should not exist`);

    // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
    const rawSettings = promisify(fs.readFile)(path.join(t.context.userDataDirPath, "settings.bin"));
    t.true(rawSettings.toString().indexOf(ENV.loginPrefix) === -1);
});
