import playwrightTest from "@playwright/test";

import {accountBadgeCssSelector} from "src/e2e/lib/util";
import {asyncDelay} from "src/shared/util";
import {initAppWithTestContext} from "./lib/init-app";
import {LoginFieldContainer} from "src/shared/model/container";
import {
    ONE_SECOND_MS, RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE, RUNTIME_ENV_E2E_PROTONMAIL_LOGIN, RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD,
    RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN,
} from "src/shared/constants";
import {test} from "./lib/test";

const {expect} = playwrightTest;

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

    test("unread check:", async () => {
        await initAppWithTestContext({initial: true}, async (testContext) => {
            const pauseMs = ONE_SECOND_MS * 20;
            const unreadBadgeSelector = accountBadgeCssSelector();

            await testContext.workflow.login({setup: true, savePassword: false});
            await testContext.workflow.addAccount({login, password, twoFactorCode});
            await testContext.workflow.selectAccount();

            await asyncDelay(pauseMs);

            const parsedUnreadText = await testContext.firstWindowPage.$eval(unreadBadgeSelector, (el) => el.innerHTML);
            const parsedUnread = Number(parsedUnreadText?.replace(/\D/g, ""));
            expect(!isNaN(parsedUnread) && parsedUnread >= unread).toStrictEqual(true);
        });
    });
}
