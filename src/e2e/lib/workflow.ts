import {expect} from "@playwright/test";
import path from "path";

import {accountCssSelector, mainProcessEvaluationFunctions} from "src/e2e/lib/util";
import {asyncDelay} from "src/shared/util";
import {CONF, ENV, GLOBAL_STATE} from "src/e2e/lib/const";
import {ONE_SECOND_MS, PROTON_API_ENTRY_URLS} from "src/shared/constants";
import {TestContext} from "./model";

const resolveEntryUrlIndexByValue = (entryUrl: string): number => {
    const index = PROTON_API_ENTRY_URLS.findIndex((url) => url === entryUrl);
    if (index === -1) {
        throw new Error(`Failed to resolve entry url index by "${entryUrl}" value`);
    }
    return index;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const buildWorkflow = (testContext: TestContext) => {
    const workflow = {
        async saveScreenshot(title?: string): Promise<string | void> {
            {
                const alive = (
                    testContext.app.windows().length > 1
                    &&
                    await testContext.app.evaluate(
                        ({BrowserWindow}) => BrowserWindow.getFocusedWindow()?.webContents.isDestroyed() === false,
                    )
                );
                if (!alive) {
                    return;
                }
            }
            const file = path.join(
                testContext.outputDirPath,
                `screenshot-${String(title)}-${new Date().toISOString()}.png`.replace(/[^A-Za-z0-9.]/g, "_"),
            );
            await testContext.firstWindowPage.screenshot({path: file});
            console.info(`Screenshot saved to: ${file}`); // eslint-disable-line no-console
            return file;
        },

        // async destroyApp(allowDestroyedExecutionContext?: boolean): Promise<void> {
        //     await workflow.saveScreenshot();
        //
        //     try {
        //         await testContext.app.close();
        //     } catch (e) {
        //         if (
        //             allowDestroyedExecutionContext
        //             &&
        //             (e as { message?: string }).message === "Execution context was destroyed, most likely because of a navigation."
        //         ) {
        //             console.log(e); // eslint-disable-line no-console
        //             return;
        //         }
        //         throw e;
        //     }
        // },

        async login(options: { setup: boolean; savePassword: boolean; hiddenWindow?: boolean }): Promise<void> {
            await asyncDelay(CONF.timeouts.transition);

            if (options.setup) {
                const expected = "/(settings-outlet:settings/settings-setup)";
                try {
                    await testContext.firstWindowPage.waitForURL(
                        `**${expected}`,
                        {timeout: CONF.timeouts.elementTouched * 2, waitUntil: "networkidle"},
                    );
                } catch (e) {
                    const actual = await workflow.getLocationHash();
                    console.log( // eslint-disable-line no-console
                        nameof.full(workflow.login), // eslint-disable-line @typescript-eslint/unbound-method
                        options, `"settings-setup" page url`,
                        {actual, expected},
                    );
                    throw e;
                }
            } else {
                await workflow.loginPageUrlTest(`login: "settings-setup" page url`, {hiddenWindow: options.hiddenWindow});
            }

            await testContext.firstWindowPage.fill("[formControlName=password]", ENV.masterPassword, {timeout: CONF.timeouts.element});

            if (options.setup) {
                await testContext.firstWindowPage.fill(
                    "[formControlName=passwordConfirm]",
                    ENV.masterPassword,
                    {timeout: CONF.timeouts.element},
                );
            }
            if (options.savePassword) {
                await testContext.firstWindowPage.click("#savePasswordCheckbox + label", {timeout: CONF.timeouts.element});
            }
            await testContext.firstWindowPage.click("button[type=submit]", {timeout: CONF.timeouts.element * 2});

            if (options.setup) {
                const {savePassword: notificationDisplaying} = options;
                {
                    const expected = notificationDisplaying
                        ? "/(settings-outlet:settings/account-edit//accounts-outlet:accounts//notifications-outlet:notifications)"
                        : "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)";
                    try {
                        await testContext.firstWindowPage.waitForURL(
                            `**${expected}`,
                            {timeout: CONF.timeouts.encryption * 5, waitUntil: "networkidle"},
                        );
                    } catch (e) {
                        const actual = await workflow.getLocationHash();
                        console.log( // eslint-disable-line no-console
                            nameof.full(workflow.login), // eslint-disable-line @typescript-eslint/unbound-method
                            options,
                            {actual, expected},
                        );
                        throw e;
                    }
                }
                if (notificationDisplaying) {
                    // closing notifications block
                    await testContext.firstWindowPage.click(
                        "electron-mail-notification-item .alert-dismissible.alert-warning > [type=button].close",
                    );
                    await asyncDelay(CONF.timeouts.elementTouched);
                }
                // TODO make sure there are no accounts added
                await workflow.closeSettingsModal("login");
            } else {
                const expected = testContext.sinon.addAccountSpy.callCount
                    ? "/(accounts-outlet:accounts)"
                    : "/(settings-outlet:settings/account-edit//accounts-outlet:accounts//stub-outlet:stub)";
                try {
                    await testContext.firstWindowPage.waitForURL(
                        `**${expected}`,
                        {timeout: CONF.timeouts.encryption * 5, waitUntil: "networkidle"},
                    );
                } catch (e) {
                    const actual = await workflow.getLocationHash();
                    console.log( // eslint-disable-line no-console
                        nameof.full(workflow.login), // eslint-disable-line @typescript-eslint/unbound-method
                        options,
                        {actual, expected},
                    );
                    throw e;
                }
            }

            await asyncDelay(CONF.timeouts.transition);

            {
                const actual = await workflow.accountsCount();
                const expected = testContext.sinon.addAccountSpy.callCount;
                expect(actual).toStrictEqual(expected);
            }
        },

        async afterLoginUrlTest(
            workflowPrefix: string,
            options?: { hiddenWindow?: boolean, expectLoginPage?: boolean },
        ): Promise<void> {
            const actual = await workflow.getLocationHash(options?.hiddenWindow);
            const expected = options?.expectLoginPage
                ? ["/(settings-outlet:settings/login)"]
                : [
                    "/(accounts-outlet:accounts)",
                    "/(accounts-outlet:accounts//stub-outlet:stub)",
                    // "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)" // not added account case
                ];
            try {
                expect(expected).toContainEqual(actual);
            } catch {
                console.log({workflowPrefix}); // eslint-disable-line no-console
            }
        },

        async loginPageUrlTest(workflowPrefix: string, options?: { hiddenWindow?: boolean }): Promise<void> {
            const actual = await workflow.getLocationHash(options?.hiddenWindow);
            try {
                expect(
                    [
                        "/(settings-outlet:settings/login)",
                        "/(settings-outlet:settings/login//stub-outlet:stub)",
                    ],
                ).toContainEqual(actual);
            } catch {
                console.log({workflowPrefix}); // eslint-disable-line no-console
            }
        },

        async addAccount(
            account: { login?: string; password?: string; twoFactorCode?: string; entryUrlValue?: string },
        ): Promise<void> {
            const login = account.login
                ? account.login
                : `${ENV.loginPrefix}-${GLOBAL_STATE.loginPrefixCount++}`;

            await workflow.openSettingsModal(0);

            // select adding account menu item
            await testContext.firstWindowPage.click("#goToAccountsSettingsLink");

            {
                const el = await testContext.firstWindowPage.waitForSelector(
                    "#accountEditFormEntryUrlField .ng-select-container",
                    {state: "visible"},
                );
                await el.dispatchEvent("mousedown");
            }

            {
                const entryUrlIndex = account.entryUrlValue
                    ? resolveEntryUrlIndexByValue(account.entryUrlValue)
                    : 0;
                await testContext.firstWindowPage.click(`[entry-url-option-index="${entryUrlIndex}"]`);
            }

            await testContext.firstWindowPage.fill("[formControlName=login]", login);
            if (account.password) {
                await testContext.firstWindowPage.fill("[formControlName=password]", account.password);
            }
            if (account.twoFactorCode) {
                await testContext.firstWindowPage.fill("[formControlName=twoFactorCode]", account.twoFactorCode);
            }

            const expectedAccountsCount = await workflow.accountsCount() + 1;

            await testContext.firstWindowPage.click(`.modal-body button[type="submit"]`);

            // account got added to the settings modal account list
            await testContext.firstWindowPage.waitForSelector(
                `.modal-body .d-inline-block > span[data-login='${login}']`,
                {timeout: CONF.timeouts.encryption, state: "visible"},
            );

            await workflow.closeSettingsModal("addAccount");

            expect(expectedAccountsCount).toStrictEqual(await workflow.accountsCount());

            await workflow.selectAccount(expectedAccountsCount - 1);

            // make sure webview api got initialized (page loaded and login auto-filled)
            try {
                await testContext.firstWindowPage.waitForSelector(
                    `${accountCssSelector(expectedAccountsCount - 1)} > .login-filled-once`,
                    {timeout: CONF.timeouts.loginFilledOnce, state: "visible"},
                );
            } finally {
                await workflow.saveScreenshot();
            }
        },

        async selectAccount(zeroStartedAccountIndex = 0): Promise<void> {
            await testContext.firstWindowPage.click(accountCssSelector(zeroStartedAccountIndex));
            await asyncDelay(CONF.timeouts.elementTouched);
            // TODO make sure account is selected
        },

        async accountsCount(): Promise<number> {
            return (await testContext.firstWindowPage.$$(`.list-group.accounts-list > electron-mail-account-title`)).length;
        },

        async openSettingsModal(index?: number): Promise<void> {
            const listGroupSelector = ".modal-body .list-group";

            // open modal if not yet opened
            try {
                await testContext.firstWindowPage.waitForSelector(listGroupSelector, {timeout: ONE_SECOND_MS, state: "visible"});
            } catch {
                await testContext.firstWindowPage.click(".controls .dropdown-toggle");
                await testContext.firstWindowPage.click("#optionsMenuItem");
            }
            // making sure modal is opened TODO consider test by url too
            await testContext.firstWindowPage.waitForSelector(listGroupSelector, {state: "visible"});

            if (typeof index === "undefined") {
                return;
            }

            await testContext.firstWindowPage.click(`${listGroupSelector} .list-group-item-action:nth-child(${index + 1})`);

            if (index === 0) {
                await testContext.firstWindowPage.waitForSelector(".modal-body electron-mail-accounts-list", {state: "visible"});
            }
        },

        async closeSettingsModal(cause: "addAccount" | "login"): Promise<void> {
            await testContext.firstWindowPage.click(`[type="button"].close`);
            {
                const expected = "/(accounts-outlet:accounts)";
                try {
                    await testContext.firstWindowPage.waitForURL(
                        `**${expected}`,
                        {timeout: CONF.timeouts.elementTouched * 2, waitUntil: "networkidle"},
                    );
                } catch (e) {
                    const actual = await workflow.getLocationHash();
                    console.log(`${cause} (settings modal closed)`, {actual, expected}); // eslint-disable-line no-console
                    throw e;
                }
            }
        },

        async logout(options?: { hiddenWindow?: boolean }): Promise<void> {
            await testContext.firstWindowPage.click("electron-mail-accounts .controls .dropdown-toggle");
            await asyncDelay(CONF.timeouts.transition);
            await testContext.firstWindowPage.click("#logoutMenuItem");
            try {
                await testContext.firstWindowPage.waitForSelector(
                    "#loginFormPasswordControl",
                    {state: "visible", timeout: CONF.timeouts.logout},
                );
            } catch {
                await workflow.saveScreenshot();
            }
            await workflow.loginPageUrlTest("logout: login page url", options);
            await asyncDelay(CONF.timeouts.transition);
        },

        async exit(): Promise<void> {
            {
                // option #1
                await testContext.firstWindowPage.click("electron-mail-accounts .controls .dropdown-toggle");
                await asyncDelay(CONF.timeouts.transition);
                await testContext.firstWindowPage.click("#exitMenuItem");
                //// option #2
                // await testContext.app.evaluate(
                //     async (electron, options: { resolveFocusedWindow: boolean, resolveBrowserWindowStringified: string }) => {
                //         // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                //         const resolveBrowserWindow: typeof mainProcessEvaluationFunctions.resolveBrowserWindow
                //             = eval(options.resolveBrowserWindowStringified.toString());
                //         await resolveBrowserWindow(electron, options).webContents.executeJavaScript(`
                //         (async () => {
                //             await __ELECTRON_EXPOSURE__.buildIpcMainClient()("quit")();
                //         })();
                //     `);
                //     },
                //     {
                //         resolveFocusedWindow: false,
                //         resolveBrowserWindowStringified: mainProcessEvaluationFunctions.resolveBrowserWindow.toString(),
                //     },
                // );
            }

            await asyncDelay(CONF.timeouts.transition * 3);

            // delete (t.context as Mutable<Partial<Pick<typeof t.context, "app">>>).app;
        },

        async getLocationHash(hiddenWindow?: boolean): Promise<string> {
            const url = await testContext.app.evaluate(
                (electron, options: { resolveFocusedWindow: boolean, resolveBrowserWindowStringified: string }) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const resolveBrowserWindow: typeof mainProcessEvaluationFunctions.resolveBrowserWindow
                        = eval(options.resolveBrowserWindowStringified.toString());
                    return resolveBrowserWindow(electron, options).webContents.getURL();
                },
                {
                    resolveFocusedWindow: !hiddenWindow,
                    resolveBrowserWindowStringified: mainProcessEvaluationFunctions.resolveBrowserWindow.toString(),
                },
            );
            return String(url.split("#").pop());
        },
    };

    return workflow;
};
