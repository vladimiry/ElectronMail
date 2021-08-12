import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import ava, {ExecutionContext, TestInterface} from "ava";
import sinon, {spy as sinonSpy} from "sinon";
import {ElectronApplication, _electron} from "playwright";
import {omit, randomString} from "remeda";

import packageJSON from "package.json";
import {
    BINARY_NAME,
    ONE_SECOND_MS,
    PACKAGE_NAME,
    PRODUCT_NAME,
    PROTON_API_ENTRY_URLS,
    RUNTIME_ENV_USER_DATA_DIR,
} from "src/shared/constants";
import {accountCssSelector, mainProcessEvaluationFunctions, saveScreenshot} from "src/e2e/lib";
import {asyncDelay} from "src/shared/util";

export interface TestContext {
    testStatus: "initial" | "success" | "fail";
    readonly app: ElectronApplication;
    readonly firstWindowPage: Unpacked<ReturnType<ElectronApplication["firstWindow"]>>;
    readonly outputDirPath: string;
    readonly userDataDirPath: string;
    readonly appDirPath: string;
    readonly logFilePath: string;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    readonly workflow: ReturnType<typeof buildWorkflow>;
    readonly sinon: {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        readonly addAccountSpy: sinon.SinonSpy<[Parameters<ReturnType<typeof buildWorkflow>["addAccount"]>[0]], Promise<void>>;
    };
}

export const test = ava as TestInterface<TestContext>;

export const ENV = {
    masterPassword: `master-password-${randomString(8)}`,
    loginPrefix: `login-${randomString(8)}`,
};

export const CI = Boolean(process.env.CI);

export const {name: PROJECT_NAME, version: PROJECT_VERSION} = packageJSON;

const rootDirPath = path.resolve(__dirname, process.cwd());
const appDirPath = path.join(rootDirPath, "./app");
const mainScriptFilePath = path.join(appDirPath, "./electron-main-e2e.js");

const CONF = {
    timeouts: {
        element: ONE_SECOND_MS,
        elementTouched: ONE_SECOND_MS * (CI ? 1.5 : 0.3),
        encryption: ONE_SECOND_MS * (CI ? 10 : 1.5),
        transition: ONE_SECOND_MS * (CI ? 3 : 0.3),
        logout: ONE_SECOND_MS * (CI ? 20 : 8),
        loginFilledOnce: ONE_SECOND_MS * (CI ? 60 : 15),
    },
} as const;

const GLOBAL_STATE = {
    loginPrefixCount: 0,
};

function mkOutputDirs(dirs: string[]): void {
    dirs.forEach((dir) => fsExtra.ensureDirSync(dir));
}

function resolveEntryUrlIndexByValue(entryUrl: string): number {
    const index = PROTON_API_ENTRY_URLS.findIndex((url) => url === entryUrl);

    if (index === -1) {
        throw new Error(`Failed to resolve entry url index by "${entryUrl}" value`);
    }

    return index;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildWorkflow(t: ExecutionContext<TestContext>) {
    const {context} = t;
    const workflow = {
        async destroyApp(allowDestroyedExecutionContext?: boolean): Promise<void> {
            await saveScreenshot(t);

            try {
                await context.app.close();
            } catch (e) {
                if (
                    allowDestroyedExecutionContext
                    &&
                    (e as { message?: string }).message === "Execution context was destroyed, most likely because of a navigation."
                ) {
                    console.log(e); // eslint-disable-line no-console
                    return;
                }
                throw e;
            }
        },

        async login(options: { setup: boolean; savePassword: boolean; hiddenWindow?: boolean }): Promise<void> {
            await asyncDelay(CONF.timeouts.transition);

            if (options.setup) {
                const expected = "/(settings-outlet:settings/settings-setup)";
                try {
                    await context.firstWindowPage.waitForURL(
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

            await context.firstWindowPage.fill("[formControlName=password]", ENV.masterPassword, {timeout: CONF.timeouts.element});

            if (options.setup) {
                await context.firstWindowPage.fill(
                    "[formControlName=passwordConfirm]",
                    ENV.masterPassword,
                    {timeout: CONF.timeouts.element},
                );
            }
            if (options.savePassword) {
                await context.firstWindowPage.click("#savePasswordCheckbox + label", {timeout: CONF.timeouts.element});
            }
            await context.firstWindowPage.click("button[type=submit]", {timeout: CONF.timeouts.element * 2});

            if (options.setup) {
                const {savePassword: notificationDisplaying} = options;
                {
                    const expected = notificationDisplaying
                        ? "/(settings-outlet:settings/account-edit//accounts-outlet:accounts//notifications-outlet:notifications)"
                        : "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)";
                    try {
                        await context.firstWindowPage.waitForURL(
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
                    await context.firstWindowPage.click(
                        "electron-mail-notification-item .alert-dismissible.alert-warning > [type=button].close",
                    );
                    await asyncDelay(CONF.timeouts.elementTouched);
                }
                // TODO make sure there are no accounts added
                await workflow.closeSettingsModal("login");
            } else {
                const expected = t.context.sinon.addAccountSpy.callCount
                    ? "/(accounts-outlet:accounts)"
                    : "/(settings-outlet:settings/account-edit//accounts-outlet:accounts//stub-outlet:stub)";
                try {
                    await context.firstWindowPage.waitForURL(
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
                const expected = t.context.sinon.addAccountSpy.callCount;
                t.is(actual, expected);
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
            t.true(
                expected.includes(actual),
                `workflow.${workflowPrefix}: "accounts" page url (${JSON.stringify({expected, actual})})`,
            );
        },

        async loginPageUrlTest(workflowPrefix: string, options?: { hiddenWindow?: boolean }): Promise<void> {
            const actual = await workflow.getLocationHash(options?.hiddenWindow);
            t.true(
                [
                    "/(settings-outlet:settings/login)",
                    "/(settings-outlet:settings/login//stub-outlet:stub)",
                ].includes(actual),
                `workflow.${workflowPrefix}: "login" page url (${JSON.stringify({actual})})`,
            );
        },

        async addAccount(
            account: { login?: string; password?: string; twoFactorCode?: string; entryUrlValue?: string },
        ): Promise<void> {
            const login = account.login
                ? account.login
                : `${ENV.loginPrefix}-${GLOBAL_STATE.loginPrefixCount++}`;

            await workflow.openSettingsModal(0);

            // select adding account menu item
            await context.firstWindowPage.click("#goToAccountsSettingsLink");

            {
                const el = await context.firstWindowPage.waitForSelector(
                    "#accountEditFormEntryUrlField .ng-select-container",
                    {state: "visible"},
                );
                await el.dispatchEvent("mousedown");
            }

            {
                const entryUrlIndex = account.entryUrlValue
                    ? resolveEntryUrlIndexByValue(account.entryUrlValue)
                    : 0;
                await context.firstWindowPage.click(`[entry-url-option-index="${entryUrlIndex}"]`);
            }

            await context.firstWindowPage.fill("[formControlName=login]", login);
            if (account.password) {
                await context.firstWindowPage.fill("[formControlName=password]", account.password);
            }
            if (account.twoFactorCode) {
                await context.firstWindowPage.fill("[formControlName=twoFactorCode]", account.twoFactorCode);
            }

            const expectedAccountsCount = await workflow.accountsCount() + 1;

            await context.firstWindowPage.click(`.modal-body button[type="submit"]`);

            // account got added to the settings modal account list
            await context.firstWindowPage.waitForSelector(
                `.modal-body .d-inline-block > span[data-login='${login}']`,
                {timeout: CONF.timeouts.encryption, state: "visible"},
            );

            await workflow.closeSettingsModal("addAccount");

            t.is(expectedAccountsCount, await workflow.accountsCount(), "test expected accounts count");

            await workflow.selectAccount(expectedAccountsCount - 1);

            // make sure webview api got initialized (page loaded and login auto-filled)
            try {
                await context.firstWindowPage.waitForSelector(
                    `${accountCssSelector(expectedAccountsCount - 1)} > .login-filled-once`,
                    {timeout: CONF.timeouts.loginFilledOnce, state: "visible"},
                );
            } finally {
                await saveScreenshot(t);
            }
        },

        async selectAccount(zeroStartedAccountIndex = 0): Promise<void> {
            await context.firstWindowPage.click(accountCssSelector(zeroStartedAccountIndex));
            await asyncDelay(CONF.timeouts.elementTouched);
            // TODO make sure account is selected
        },

        async accountsCount(): Promise<number> {
            return (await context.firstWindowPage.$$(`.list-group.accounts-list > electron-mail-account-title`)).length;
        },

        async openSettingsModal(index?: number): Promise<void> {
            const listGroupSelector = ".modal-body .list-group";

            // open modal if not yet opened
            try {
                await context.firstWindowPage.waitForSelector(listGroupSelector, {timeout: ONE_SECOND_MS, state: "visible"});
            } catch {
                await context.firstWindowPage.click(".controls .dropdown-toggle");
                await context.firstWindowPage.click("#optionsMenuItem");
            }
            // making sure modal is opened TODO consider test by url too
            await context.firstWindowPage.waitForSelector(listGroupSelector, {state: "visible"});

            if (typeof index === "undefined") {
                return;
            }

            await context.firstWindowPage.click(`${listGroupSelector} .list-group-item-action:nth-child(${index + 1})`);

            if (index === 0) {
                await context.firstWindowPage.waitForSelector(".modal-body electron-mail-accounts-list", {state: "visible"});
            }
        },

        async closeSettingsModal(cause: "addAccount" | "login"): Promise<void> {
            await context.firstWindowPage.click(`[type="button"].close`);
            {
                const expected = "/(accounts-outlet:accounts)";
                try {
                    await context.firstWindowPage.waitForURL(
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
            await context.firstWindowPage.click("electron-mail-accounts .controls .dropdown-toggle");
            await asyncDelay(CONF.timeouts.transition);
            await context.firstWindowPage.click("#logoutMenuItem");
            try {
                await context.firstWindowPage.waitForSelector(
                    "#loginFormPasswordControl",
                    {state: "visible", timeout: CONF.timeouts.logout},
                );
            } catch {
                await saveScreenshot(t);
            }
            await workflow.loginPageUrlTest("logout: login page url", options);
            await asyncDelay(CONF.timeouts.transition);
        },

        async exit(): Promise<void> {
            {
                // option #1
                await context.firstWindowPage.click("electron-mail-accounts .controls .dropdown-toggle");
                await asyncDelay(CONF.timeouts.transition);
                await context.firstWindowPage.click("#exitMenuItem");
                //// option #2
                // await context.app.evaluate(
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
            const url = await context.app.evaluate(
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
}

export const initApp = async (
    t: ExecutionContext<TestContext>, options: { initial: boolean },
): Promise<TestContext["workflow"]> => {
    const contextPatch: Mutable<Partial<typeof t.context>> = {};

    contextPatch.workflow = t.context.workflow ?? buildWorkflow(t);
    contextPatch.sinon = t.context.sinon ?? {addAccountSpy: sinonSpy(contextPatch.workflow, "addAccount")};

    const outputDirPath = contextPatch.outputDirPath = t.context.outputDirPath
        ?? path.join(rootDirPath, "./output/e2e", String(Date.now()));
    const userDataDirPath = path.join(outputDirPath, "./app-data");
    const logFilePath = path.join(userDataDirPath, "log.log");

    mkOutputDirs([
        outputDirPath,
        userDataDirPath,
    ]);

    contextPatch.appDirPath = appDirPath;
    contextPatch.userDataDirPath = userDataDirPath;
    contextPatch.logFilePath = logFilePath;

    if (options.initial) {
        t.false(fs.existsSync(path.join(userDataDirPath, "config.json")),
            `"config.json" should not exist yet in "${userDataDirPath}"`);
        t.false(fs.existsSync(path.join(userDataDirPath, "settings.bin")),
            `"settings.bin" should not exist yet in "${userDataDirPath}"`);
    }

    const app = contextPatch.app = await _electron.launch({
        args: [
            mainScriptFilePath,
            `--user-data-dir=${userDataDirPath}`,
        ],
        env: {
            ...process.env,
            ELECTRON_ENABLE_LOGGING: "1",
            [RUNTIME_ENV_USER_DATA_DIR]: userDataDirPath,
        },
    });
    const firstWindowPage = contextPatch.firstWindowPage = await app.firstWindow();

    await (async (): Promise<void> => {
        const el = await firstWindowPage.waitForSelector(
            ".e2e-stub-element",
            {timeout: ONE_SECOND_MS * 3, state: options.initial ? "visible" : "attached"},
        );
        const elText = await el.innerText();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const {title: pageTitle, userAgent}: { title: string; userAgent: string } = JSON.parse(elText);
        t.is(pageTitle, "", "page title should be empty");
        t.truthy(userAgent, "user agent should be filled");
        // TODO also test user agents of webviews
        {
            const bannedUserAgentWords = (["electron", PRODUCT_NAME, PACKAGE_NAME, BINARY_NAME, PROJECT_VERSION] as readonly string[])
                .map((banned) => banned.toLowerCase());
            t.false(
                bannedUserAgentWords.some((banned) => userAgent.toLowerCase().includes(banned)),
                `User agent "${userAgent}" should not include any of "${JSON.stringify(bannedUserAgentWords)}"`,
            );
        }
    })();

    t.deepEqual(
        omit(
            await app.evaluate(
                mainProcessEvaluationFunctions.testMainProcessSpecificStuff, // eslint-disable-line @typescript-eslint/unbound-method
                {...options, resolveBrowserWindowStringified: mainProcessEvaluationFunctions.resolveBrowserWindow.toString()},
            ),
            ["resolveBrowserWindowStringified"],
        ),
        options,
    );

    await asyncDelay(CONF.timeouts.encryption);

    Object.assign(t.context, contextPatch);

    return t.context.workflow;
};
