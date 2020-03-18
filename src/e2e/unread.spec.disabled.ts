// TODO remove the "tslint:disable:await-promise" when Spectron gets proper declaration files, track of the following issues:
// - https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25186
// - https://github.com/electron/spectron/issues/358

// tslint:disable:await-promise

import {LoginFieldContainer} from "src/shared/model/container";
import {ONE_SECOND_MS} from "src/shared/constants";
import {accountBadgeCssSelector, initApp, test} from "./workflow";

// protonmail account to login during e2e tests running
const RUNTIME_ENV_E2E_PROTONMAIL_LOGIN = `ELECTRON_MAIL_E2E_PROTONMAIL_LOGIN`;
const RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD = `ELECTRON_MAIL_E2E_PROTONMAIL_PASSWORD`;
const RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE = `ELECTRON_MAIL_E2E_PROTONMAIL_2FA_CODE`;
const RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN = `ELECTRON_MAIL_E2E_PROTONMAIL_UNREAD_MIN`;

for (const {login, password, twoFactorCode, unread} of ([
    {
        login: process.env[RUNTIME_ENV_E2E_PROTONMAIL_LOGIN],
        password: process.env[RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD],
        twoFactorCode: process.env[RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE],
        unread: Number(process.env[RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN]),
    },
] as Array<LoginFieldContainer & { password: string; twoFactorCode: string; unread: number }>)) {
    if (!login || !password || !unread || isNaN(unread)) {
        continue;
    }

    test.serial(`unread check: `, async (t) => {
        const workflow = await initApp(t, {initial: true});
        const pauseMs = ONE_SECOND_MS * 20;
        const unreadBadgeSelector = accountBadgeCssSelector();
        const state: { parsedUnreadText?: string } = {};

        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({login, password, twoFactorCode});
        await workflow.selectAccount();

        await t.context.app.client.pause(pauseMs);

        try {
            try {
                state.parsedUnreadText = await t.context.app.client.getText(unreadBadgeSelector);
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
