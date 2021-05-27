import electron from "electron";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import sinon from "sinon";
import ava, {ExecutionContext, TestInterface} from "ava";
import {Application} from "spectron";
import {randomString} from "remeda";

import {
    BINARY_NAME,
    ONE_SECOND_MS,
    PACKAGE_NAME,
    PRODUCT_NAME,
    PROTON_API_ENTRY_URLS,
    RUNTIME_ENV_USER_DATA_DIR,
} from "src/shared/constants";
import {accountCssSelector, saveScreenshot, waitForClickable, waitForEnabled} from "src/e2e/lib";

export interface TestContext {
    testStatus: "initial" | "success" | "fail";
    app: Application;
    outputDirPath: string;
    userDataDirPath: string;
    appDirPath: string;
    logFilePath: string;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    workflow: ReturnType<typeof buildWorkflow>;
    sinon: {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        addAccountSpy: sinon.SinonSpy<[Parameters<ReturnType<typeof buildWorkflow>["addAccount"]>[0]], Promise<void>>;
    };
}

export const test = ava as TestInterface<TestContext>;

export const ENV = {
    masterPassword: `master-password-${randomString(8)}`,
    loginPrefix: `login-${randomString(8)}`,
};

export const CI = Boolean(process.env.CI);

export const {name: PROJECT_NAME, version: PROJECT_VERSION} // eslint-disable-next-line @typescript-eslint/no-var-requires
    = require("package.json") as { name: string, version: string }; // tslint:disable-line: no-import-zones

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
    const workflow = {
        async destroyApp(): Promise<void> {
            await saveScreenshot(t);

            // TODO update to electron 2: app.isRunning() returns undefined, uncomment as soon as it's fixed
            if (!t.context.app || !t.context.app.isRunning()) {
                t.pass("app is not running");
                return;
            }

            await t.context.app.stop();
            t.is(t.context.app.isRunning(), false);

            delete (t.context as Partial<Pick<typeof t.context, "app">>).app;
        },

        async login(options: { setup: boolean; savePassword: boolean }): Promise<void> {
            const {client} = t.context.app;
            let selector: string | null = null;

            await client.pause(CONF.timeouts.transition);

            if (options.setup) {
                t.is(
                    await workflow.getLocationHash(), "/(settings-outlet:settings/settings-setup)",
                    `login: "settings-setup" page url`,
                );
            } else {
                await workflow.loginPageUrlTest(`login: "settings-setup" page url`);
            }

            await waitForEnabled(
                client,
                "[formControlName=password]",
                {callback: async (el) => el.setValue(ENV.masterPassword), timeout: CONF.timeouts.element},
            );

            if (options.setup) {
                await waitForEnabled(
                    client,
                    "[formControlName=passwordConfirm]",
                    {callback: async (el) => el.setValue(ENV.masterPassword), timeout: CONF.timeouts.element},
                );
            }

            if (options.savePassword) {
                await waitForClickable(
                    client,
                    "#savePasswordCheckbox + label",
                    {callback: async (el) => el.click(), timeout: CONF.timeouts.element},
                );
            }

            await waitForClickable(
                client,
                "button[type=submit]",
                {callback: async (el) => el.click(), timeout: CONF.timeouts.element},
            );

            await (async (): Promise<void> => {
                selector = `electron-mail-accounts .list-group.accounts-list`;
                const timeout = CONF.timeouts.encryption * 5;
                try {
                    await client
                        .$(selector)
                        .then(async (el) => el.waitForDisplayed({timeout}));
                } catch (error) {
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
            })();

            if (options.setup) {
                const {savePassword: notificationDisplaying} = options;
                const expectedLocationHash = notificationDisplaying
                    ? "/(settings-outlet:settings/account-edit//accounts-outlet:accounts//notifications-outlet:notifications)"
                    : "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)";
                t.is(
                    await workflow.getLocationHash(),
                    expectedLocationHash,
                    `login: "accounts" page url`,
                );
                if (notificationDisplaying) {
                    // closing notifications block
                    await waitForClickable(
                        client,
                        "electron-mail-notification-item .alert-dismissible.alert-warning > [type=button].close",
                        {callback: async (el) => el.click()},
                    );
                    await client.pause(CONF.timeouts.elementTouched);
                }
                // TODO make sure there are no accounts added
                await workflow.closeSettingsModal();
            }

            await client.pause(CONF.timeouts.transition);

            const accountsCount = await workflow.accountsCount();
            t.is(accountsCount, t.context.sinon.addAccountSpy.callCount);
        },

        async afterLoginUrlTest(workflowPrefix = ""): Promise<void> {
            const actual = await workflow.getLocationHash();
            t.true(
                [
                    "/(accounts-outlet:accounts)",
                    "/(accounts-outlet:accounts//stub-outlet:stub)",
                    // "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)" // not added account case
                ].includes(actual),
                `workflow.${workflowPrefix}: "accounts" page url (${JSON.stringify({actual})})`,
            );
        },

        async loginPageUrlTest(workflowPrefix = ""): Promise<void> {
            const actual = await workflow.getLocationHash();
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
            const {client} = t.context.app;
            const login = account.login
                ? account.login
                : `${ENV.loginPrefix}-${GLOBAL_STATE.loginPrefixCount++}`;
            let selector = "";

            await workflow.openSettingsModal(0);

            // select adding account menu item
            await waitForClickable(
                client,
                "#goToAccountsSettingsLink",
                {callback: async (el) => el.click()},
            );

            // required: entryUrl
            await waitForClickable(
                client,
                selector = "#accountEditFormEntryUrlField .ng-select-container",
            );
            await t.context.app.client.execute(
                (selector) => {
                    const el = document.querySelector<HTMLButtonElement>(selector);
                    if (!el) {
                        throw new Error(`Failed to resolve element using "${String(selector)}" selector`);
                    }
                    el.dispatchEvent(new MouseEvent("mousedown"));
                },
                selector,
            );

            const entryUrlIndex = account.entryUrlValue
                ? resolveEntryUrlIndexByValue(account.entryUrlValue)
                : 0;
            await waitForClickable(
                client,
                `[entry-url-option-index="${entryUrlIndex}"]`,
                {callback: async (el) => el.click()},
            );

            // required: login
            await waitForEnabled(
                client,
                "[formControlName=login]",
                {callback: async (el) => el.setValue(login)},
            );

            if (account.password) {
                const {password} = account;
                await waitForEnabled(
                    client,
                    "[formControlName=password]",
                    {callback: async (el) => el.setValue(password)},
                );
            }

            if (account.twoFactorCode) {
                const {twoFactorCode} = account;
                await waitForEnabled(
                    client,
                    "[formControlName=twoFactorCode]",
                    {callback: async (el) => el.setValue(twoFactorCode)},
                );
            }

            const expectedAccountsCount = await workflow.accountsCount() + 1;

            await waitForClickable(
                client,
                `.modal-body button[type="submit"]`,
                {callback: async (el) => el.click()},
            );

            // account got added to the settings modal account list
            await (async (): Promise<void> => {
                selector = `.modal-body .d-inline-block > span[data-login='${login}']`;
                const timeout = CONF.timeouts.encryption;
                try {
                    await t.context.app.client
                        .$(selector)
                        .then(async (el) => el.waitForDisplayed({timeout}));
                } catch (error) {
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
            })();

            await workflow.closeSettingsModal();

            t.is(expectedAccountsCount, await workflow.accountsCount(), "test expected accounts count");

            await workflow.selectAccount(expectedAccountsCount - 1);

            // make sure webview api got initialized (page loaded and login auto-filled)
            await (async (): Promise<void> => {
                const accountIndex = expectedAccountsCount - 1;
                selector = `${accountCssSelector(accountIndex)} > .login-filled-once`;
                const timeout = CONF.timeouts.loginFilledOnce;
                try {
                    await t.context.app.client
                        .$(selector)
                        .then(async (el) => el.waitForDisplayed({timeout}));
                } catch (error) {
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                } finally {
                    await saveScreenshot(t);
                }
                await saveScreenshot(t);
            })();
        },

        async selectAccount(zeroStartedAccountIndex = 0): Promise<void> {
            const {client} = t.context.app;

            await waitForClickable(
                client,
                accountCssSelector(zeroStartedAccountIndex),
                {callback: async (el) => el.click()},
            );

            await client.pause(CONF.timeouts.elementTouched);
            // TODO make sure account is selected
        },

        async accountsCount(): Promise<number> {
            return (
                await t.context.app.client.$$(`.list-group.accounts-list > electron-mail-account-title`)
            ).length;
        },

        async openSettingsModal(index?: number): Promise<void> {
            const listGroupSelector = `.modal-body .list-group`;
            const {client} = t.context.app;

            // open modal if not yet opened
            try {
                await t.context.app.client
                    .$(listGroupSelector)
                    .then(async (el) => el.waitForDisplayed({timeout: ONE_SECOND_MS}));
            } catch (e) {
                await waitForClickable(
                    client,
                    ".controls .dropdown-toggle",
                    {callback: async (el) => el.click()},
                );
                await waitForClickable(
                    client,
                    "#optionsMenuItem",
                    {callback: async (el) => el.click()},
                );
            }

            // making sure modal is opened TODO consider test by url too
            await t.context.app.client
                .$(listGroupSelector)
                .then(async (el) => el.waitForDisplayed());

            if (typeof index === "undefined") {
                return;
            }

            await waitForClickable(
                client,
                `${listGroupSelector} .list-group-item-action:nth-child(${index + 1})`,
                {callback: async (el) => el.click()},
            );

            if (index === 0) {
                await t.context.app.client
                    .$(`.modal-body electron-mail-accounts-list`)
                    .then(async (el) => el.waitForDisplayed());
            }
        },

        async closeSettingsModal(): Promise<void> {
            const {client} = t.context.app;

            await waitForClickable(
                client,
                "button.close",
                {callback: async (el) => el.click()},
            );
            await client.pause(CONF.timeouts.elementTouched);

            // making sure modal is closed (consider testing by DOM scanning)
            t.is(
                await workflow.getLocationHash(), "/(accounts-outlet:accounts)",
                `addAccount: "accounts" page url (settings modal closed)`,
            );
        },

        async logout(): Promise<void> {
            const {client} = t.context.app;
            let selector = "";

            await waitForClickable(
                client,
                "electron-mail-accounts .controls .dropdown-toggle",
                {callback: async (el) => el.click()},
            );
            await client.pause(CONF.timeouts.transition);
            await waitForClickable(
                client,
                "#logoutMenuItem",
                {callback: async (el) => el.click()},
            );

            await (async (): Promise<void> => {
                selector = `#loginFormPasswordControl`;
                const timeout = CONF.timeouts.logout;
                try {
                    await t.context.app.client
                        .$(selector)
                        .then(async (el) => el.waitForDisplayed({timeout}));
                } catch (error) {
                    await saveScreenshot(t);
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
            })();

            await workflow.loginPageUrlTest(`logout: login page url`);

            await client.pause(CONF.timeouts.transition);
        },

        async exit(): Promise<void> {
            const {client} = t.context.app;

            await waitForClickable(
                client,
                "electron-mail-accounts .controls .dropdown-toggle",
                {callback: async (el) => el.click()},
            );
            await client.pause(CONF.timeouts.transition);
            await waitForClickable(
                client,
                "#exitMenuItem",
                {callback: async (el) => el.click()},
            );
            delete (t.context as Partial<Pick<typeof t.context, "app">>).app;
        },

        async getLocationHash(): Promise<string> {
            const url = await t.context.app.client.getUrl();
            return String(url.split("#").pop());
        },
    };

    return workflow;
}

export async function initApp(t: ExecutionContext<TestContext>, options: { initial: boolean }): Promise<TestContext["workflow"]> {
    t.context.workflow = buildWorkflow(t);
    t.context.sinon = {
        addAccountSpy: sinon.spy(t.context.workflow, "addAccount"),
    };

    const outputDirPath = t.context.outputDirPath = t.context.outputDirPath || path.join(rootDirPath, "./output/e2e", String(Date.now()));
    const userDataDirPath = path.join(outputDirPath, "./app-data");
    const logFilePath = path.join(userDataDirPath, "log.log");
    const webdriverLogPath = path.join(outputDirPath, "webdriver-log");
    const chromeDriverLogPath = path.join(outputDirPath, "chrome-driver.log");

    mkOutputDirs([
        outputDirPath,
        userDataDirPath,
        webdriverLogPath,
    ]);

    t.context.appDirPath = appDirPath;
    t.context.userDataDirPath = userDataDirPath;
    t.context.logFilePath = logFilePath;

    if (options.initial) {
        t.false(fs.existsSync(path.join(userDataDirPath, "config.json")),
            `"config.json" should not exist yet in "${userDataDirPath}"`);
        t.false(fs.existsSync(path.join(userDataDirPath, "settings.bin")),
            `"settings.bin" should not exist yet in "${userDataDirPath}"`);
    }

    t.context.app = new Application({
        // TODO consider running e2e tests on compiled/binary app too: path.join(rootPath, "./dist/linux-unpacked/electron-mail")
        path: electron as any, // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        requireName: "electronRequire",
        env: {[RUNTIME_ENV_USER_DATA_DIR]: userDataDirPath},
        args: [mainScriptFilePath],

        connectionRetryCount: 2,
        connectionRetryTimeout: ONE_SECOND_MS * 10,
        startTimeout: ONE_SECOND_MS * 30,

        webdriverOptions: {
            // WARN don't specify "webdriverLogPath" on upper/"spectron" level
            //      since "spectron" then enables {logLevel: "trace"} but the output then goes to the console rather than to file
            // TODO "webdriverOptions.outputDir / webdriverLogPath" option doesn't seem to have an effect, the output still goes to console
            outputDir: webdriverLogPath,
            logLevel: "error",
        },

        // TODO remove the tweaks aimed to fix things on windows
        // ...(CI && PLATFORM === "win32" && {
        //     chromeDriverArgs: [
        //         "--disable-gpu",
        //         // "--headless",
        //         // "--no-sandbox",
        //     ],
        // }),

        // WARN setting path chromedriver config parameters might cause the following errors happening:
        // - ChromeDriver did not start within 5000ms
        // - Failed to redirect stderr to log file.
        // - Unable to initialize logging. Exiting...
        chromeDriverLogPath,
    });

    // start
    await t.context.app.start();
    t.is(t.context.app.isRunning(), true);
    await t.context.app.client.waitUntilWindowLoaded();

    // test window state
    const {browserWindow} = t.context.app;

    await (async (): Promise<void> => {
        const text = await t.context.app.client
            .$(".e2e-stub-element")
            .then(async (el) => el.getText());
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const {title: pageTitle, userAgent}: { title: string; userAgent: string } = JSON.parse(text);

        t.is(pageTitle, "", `page title should be empty`);
        t.truthy(userAgent, `user agent should be filled`);

        // TODO also test user agents of webviews
        const bannedUserAgentWords = (["electron", PRODUCT_NAME, PACKAGE_NAME, BINARY_NAME, PROJECT_VERSION] as ReadonlyArray<string>)
            .map((banned) => banned.toLowerCase());
        t.false(
            bannedUserAgentWords.some((banned) => userAgent.toLowerCase().includes(banned)),
            `User agent "${userAgent}" should not include any of "${JSON.stringify(bannedUserAgentWords)}"`,
        );
    })();

    t.false(
        // eslint-disable-next-line @typescript-eslint/await-thenable
        await (browserWindow as unknown as Pick<Electron.WebContents, "isDevToolsOpened">).isDevToolsOpened(),
        "window'd dev tools should be closed",
    );
    // eslint-disable-next-line @typescript-eslint/await-thenable
    t.false(await browserWindow.isMinimized(), "window should not be not minimized");
    if (options.initial) {
        // TODO make below lines work with electron@v5 / travis@windows
        // eslint-disable-next-line @typescript-eslint/await-thenable
        t.true(await browserWindow.isVisible(), "window should be visible");
        // eslint-disable-next-line @typescript-eslint/await-thenable
        t.true(await browserWindow.isFocused(), "window should be focused");
    } else {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        t.false(await browserWindow.isVisible(), "window should not be visible");
        // eslint-disable-next-line @typescript-eslint/await-thenable
        t.false(await browserWindow.isFocused(), "window should not be focused");
    }
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const {width, height} = await browserWindow.getBounds();
    t.true(width > 0, "window.width should be > 0");
    t.true(height > 0, "window.height should be > 0");

    // await awaitAngular(t.context.app.client); // seems to be not needed
    // await t.context.app.client.pause(2000);

    await t.context.app.client.pause(CONF.timeouts.encryption);

    return t.context.workflow;
}
