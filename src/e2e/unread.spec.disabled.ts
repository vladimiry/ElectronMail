import {LoginFieldContainer} from "src/shared/model/container";
import {
    ONE_SECOND_MS,
    RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE,
    RUNTIME_ENV_E2E_PROTONMAIL_LOGIN,
    RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD,
    RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN
} from "src/shared/constants";
import {accountBadgeCssSelector} from "src/e2e/lib";
import {asyncDelay} from "src/shared/util";
import {initApp, test} from "./workflow";

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

        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({login, password, twoFactorCode});
        await workflow.selectAccount();

        await asyncDelay(pauseMs);

        try {
            const parsedUnreadText = await t.context.firstWindowPage.$eval(unreadBadgeSelector, (el) => el.innerHTML);
            const parsedUnread = Number(parsedUnreadText?.replace(/\D/g, ""));
            t.true(!isNaN(parsedUnread) && parsedUnread >= unread, `parsedUnread(${parsedUnread}) >= unread(${unread})`);
        } finally {
            await workflow.destroyApp();
        }
    });
}
