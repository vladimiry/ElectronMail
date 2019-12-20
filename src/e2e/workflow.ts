// TODO remove the "tslint:disable:await-promise" when spectron gets proper declaration files
// TODO track this issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25186
// tslint:disable:await-promise

import electron from "electron";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import randomString from "randomstring";
import sinon from "sinon";
import ava, {ExecutionContext, TestInterface} from "ava";
import {Application} from "spectron";
import {promisify} from "util";

import {
    ACCOUNTS_CONFIG,
    BINARY_NAME,
    ONE_SECOND_MS,
    PACKAGE_NAME,
    PRODUCT_NAME,
    RUNTIME_ENV_E2E,
    RUNTIME_ENV_USER_DATA_DIR,
} from "src/shared/constants";
import {AccountType} from "src/shared/model/account";

export interface TestContext {
    testStatus: "initial" | "success" | "fail";
    app: Application;
    outputDirPath: string;
    userDataDirPath: string;
    appDirPath: string;
    logFilePath: string;
    workflow: ReturnType<typeof buildWorkflow>;
    sinon: {
        addAccountSpy: sinon.SinonSpy<[Arguments<ReturnType<typeof buildWorkflow>["addAccount"]>[0]], Promise<void>>;
    };
}

export const test = ava as TestInterface<TestContext>;
export const ENV = {
    masterPassword: `master-password-${randomString.generate({length: 8})}`,
    loginPrefix: `login-${randomString.generate({length: 8})}`,
};
export const CI = Boolean(process.env.CI && (process.env.APPVEYOR || process.env.TRAVIS));

// tslint:disable-next-line:no-var-requires no-import-zones
export const {name: PROJECT_NAME, version: PROJECT_VERSION, description: APP_TITLE} = require("package.json");

const rootDirPath = path.resolve(__dirname, process.cwd());
const appDirPath = path.join(rootDirPath, "./app");
const mainScriptFilePath = path.join(appDirPath, "./electron-main.js");
const CONF = {
    timeouts: {
        element: ONE_SECOND_MS,
        elementTouched: ONE_SECOND_MS * (CI ? 1 : 0.3),
        encryption: ONE_SECOND_MS * (CI ? 5 : 1.5),
        transition: ONE_SECOND_MS * (CI ? 1 : 0.3),
        logout: ONE_SECOND_MS * (CI ? 6 : 3),
        loginFilledOnce: ONE_SECOND_MS * (CI ? 45 : 15),
    },
};
const GLOBAL_STATE = {
    loginPrefixCount: 0,
};

export async function initApp(t: ExecutionContext<TestContext>, options: { initial: boolean }): Promise<TestContext["workflow"]> {
    t.context.workflow = buildWorkflow(t);
    t.context.sinon = {
        addAccountSpy: sinon.spy(t.context.workflow, "addAccount"),
    };

    const outputDirPath = t.context.outputDirPath = t.context.outputDirPath || path.join(rootDirPath, "./output/e2e", String(Date.now()));
    const userDataDirPath = path.join(outputDirPath, "./app-data");
    const logFilePath = path.join(userDataDirPath, "log.log");
    const webdriverLogDirPath = path.join(outputDirPath, "webdriver-driver-log");
    const chromeDriverLogFilePath = path.join(outputDirPath, "chrome-driver.log");

    mkOutputDirs([
        outputDirPath,
        userDataDirPath,
        webdriverLogDirPath,
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
        path: electron as any,
        requireName: "electronRequire",
        env: {
            [RUNTIME_ENV_E2E]: String(true),
            [RUNTIME_ENV_USER_DATA_DIR]: userDataDirPath,
        },
        args: [mainScriptFilePath],

        // ...(CI && {
        //     startTimeout: ONE_SECOND_MS * 15,
        //     chromeDriverArgs: [/*"no-sandbox", */"headless", "disable-gpu"],
        // }),

        // TODO setting path chromedriver config parameters might cause the following errors happening:
        // - ChromeDriver did not start within 5000ms
        // - Failed to redirect stderr to log file.
        // - Unable to initialize logging. Exiting...
        webdriverLogPath: webdriverLogDirPath,
        chromeDriverLogPath: chromeDriverLogFilePath,
    });

    // start
    try {
        await t.context.app.start();
    } catch (e) {
        // tslint:disable-next-line:no-console
        console.log(`chromeDriver.logLines:\n${(t.context.app as any).chromeDriver.logLines.join("\n")}`);
        throw e;
    }
    t.is(t.context.app.isRunning(), true);
    await t.context.app.client.waitUntilWindowLoaded();

    // test window state
    const {browserWindow} = t.context.app;

    await (async () => {
        const stubElement = t.context.app.client.$(".e2e-stub-element");
        const text = await stubElement.getText();
        const {title: pageTitle, userAgent}: { title: string; userAgent: string; } = JSON.parse(text);

        t.is(pageTitle, "", `page title should be empty`);
        t.truthy(userAgent, `user agent should be filled`);

        // TODO also test user agents of webviews
        const bannedUserAgentWords = ["electron", PRODUCT_NAME, PACKAGE_NAME, BINARY_NAME, PROJECT_VERSION]
            .map((banned) => banned.toLowerCase());
        t.false(
            bannedUserAgentWords.some((banned) => userAgent.toLowerCase().includes(banned)),
            `User agent "${userAgent}" should not include any of "${JSON.stringify(bannedUserAgentWords)}"`,
        );
    })();

    // t.false(await browserWindow.webContents.isDevToolsOpened(), "browserWindow's dev tools should be closed");
    t.false(await (browserWindow as any).isDevToolsOpened(), "window'd dev tools should be closed");
    t.false(await browserWindow.isMinimized(), "window should not be not minimized");
    if (options.initial) {
        // TODO make below lines work with electron@v5 / travis@windows
        t.true(await browserWindow.isVisible(), "window should be visible");
        t.true(await browserWindow.isFocused(), "window should be focused");
    } else {
        t.false(await browserWindow.isVisible(), "window should not be visible");
        t.false(await browserWindow.isFocused(), "window should not be focused");
    }
    const {width, height} = await browserWindow.getBounds();
    t.true(width > 0, "window.width should be > 0");
    t.true(height > 0, "window.height should be > 0");

    // await awaitAngular(t.context.app.client); // seems to be not needed
    // await t.context.app.client.pause(2000);

    await t.context.app.client.pause(CONF.timeouts.encryption);

    return t.context.workflow;
}

function buildWorkflow(t: ExecutionContext<TestContext>) {
    const workflow = {
        async destroyApp() {
            await saveScreenshot(t);

            // TODO update to electron 2: app.isRunning() returns undefined, uncomment as soon as it's fixed
            if (!t.context.app || !t.context.app.isRunning()) {
                t.pass("app is not running");
                return;
            }

            await t.context.app.stop();
            t.is(t.context.app.isRunning(), false);

            delete t.context.app;
        },

        async login(options: { setup: boolean, savePassword: boolean }) {
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

            await client.waitForVisible(selector = `[formControlName="password"]`, CONF.timeouts.element);
            await client.setValue(selector, ENV.masterPassword);

            if (options.setup) {
                await client.waitForVisible(selector = `[formControlName="passwordConfirm"]`, CONF.timeouts.element);
                await client.setValue(selector, ENV.masterPassword);
            }

            if (options.savePassword) {
                await client.waitForVisible(selector = `[formControlName="savePassword"]`, CONF.timeouts.element);
                await client.click(selector);
            }

            await client.click(selector = `button[type="submit"]`);

            await (async () => {
                selector = `electron-mail-accounts .list-group.accounts-list`;
                const timeout = CONF.timeouts.encryption * 2;
                try {
                    await t.context.app.client.waitForVisible(selector, timeout);
                } catch (error) {
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
            })();

            if (options.setup) {
                t.is(
                    await workflow.getLocationHash(), "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)",
                    `login: "accounts" page url`,
                );

                // TODO make sure there are no accounts added

                await workflow.closeSettingsModal();
            }

            await client.pause(CONF.timeouts.transition);

            const accountsCount = await workflow.accountsCount();
            t.is(accountsCount, t.context.sinon.addAccountSpy.callCount);
        },

        async afterLoginUrlTest(workflowPrefix = "") {
            t.true(
                [
                    "/(accounts-outlet:accounts)",
                    "/(accounts-outlet:accounts//stub-outlet:stub)",
                ].includes(await workflow.getLocationHash()),
                `workflow.${workflowPrefix}: "accounts" page url (actual: ${await workflow.getLocationHash()})`,
            );
        },

        async loginPageUrlTest(workflowPrefix = "") {
            t.true(
                [
                    "/(settings-outlet:settings/login)",
                    "/(settings-outlet:settings/login//stub-outlet:stub)",
                ].includes(await workflow.getLocationHash()),
                `workflow.${workflowPrefix}: "login" page url (actual: ${await workflow.getLocationHash()})`,
            );
        },

        async addAccount(
            account: { type: AccountType, login?: string; password?: string; twoFactorCode?: string; entryUrlValue?: string; },
        ) {
            const {client} = t.context.app;
            const login = account.login
                ? account.login
                : `${ENV.loginPrefix}-${GLOBAL_STATE.loginPrefixCount++}`;
            let selector = "";

            await workflow.openSettingsModal(0);

            // select adding account menu item
            await client.waitForVisible(selector = `#goToAccountsSettingsLink`);
            await workflow._click(selector);

            // required: entryUrl
            await client.waitForVisible(selector = `#accountEditFormEntryUrlField .ng-select-container`);
            await workflow._mousedown(selector);
            const entryUrlIndex = account.entryUrlValue
                ? resolveEntryUrlIndexByValue(account.type, account.entryUrlValue)
                : 0;
            await client.waitForVisible(selector = `[entry-url-option-index="${entryUrlIndex}"]`);
            await workflow._click(selector);

            // required: login
            await client.setValue(`[formcontrolname=login]`, login);

            if (account.password) {
                await client.setValue(`[formcontrolname=password]`, account.password);
            }

            if (account.twoFactorCode) {
                await client.setValue(`[formcontrolname=twoFactorCode]`, account.twoFactorCode);
            }

            const expectedAccountsCount = await workflow.accountsCount() + 1;

            await workflow._click(`.modal-body button[type="submit"]`);

            // account got added to the settings modal account list
            await (async () => {
                selector = `.modal-body .d-inline-block > span[data-login='${login}']`;
                const timeout = CONF.timeouts.encryption;
                try {
                    await t.context.app.client.waitForVisible(selector, timeout);
                } catch (error) {
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
            })();

            await workflow.closeSettingsModal();

            t.is(expectedAccountsCount, await workflow.accountsCount(), "test expected accounts count");

            await workflow.selectAccount(expectedAccountsCount - 1);

            // make sure webview api got initialized (page loaded and login auto-filled)
            await (async () => {
                const accountIndex = expectedAccountsCount - 1;
                selector = `${accountCssSelector(accountIndex)} > .login-filled-once`;
                const timeout = CONF.timeouts.loginFilledOnce;
                try {
                    await t.context.app.client.waitForVisible(selector, timeout);
                } catch (error) {
                    await saveScreenshot(t);
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
                await saveScreenshot(t);
            })();
        },

        // TODO electron@5 workaround, remove this method
        //      it stopped to work since electron@v5, adding second account case (seconds button click)
        async _click(_selector: string) {
            await t.context.app.client.execute(
                (selector) => {
                    const el = document.querySelector<HTMLButtonElement>(selector);
                    if (!el) {
                        throw new Error(`Failed to resolve element using "${selector}" selector`);
                    }
                    el.click();
                },
                [_selector],
            );
        },

        // TODO electron@5 workaround, remove this method
        //      it stopped to work since electron@v5, adding second account case (seconds button click)
        async _mousedown(_selector: string) {
            await t.context.app.client.execute(
                (selector) => {
                    const el = document.querySelector<HTMLButtonElement>(selector);
                    if (!el) {
                        throw new Error(`Failed to resolve element using "${selector}" selector`);
                    }
                    el.dispatchEvent(new MouseEvent("mousedown"));
                },
                [_selector],
            );
        },

        async selectAccount(zeroStartedAccountIndex = 0) {
            const {client} = t.context.app;

            await client.click(accountCssSelector(zeroStartedAccountIndex));
            await client.pause(CONF.timeouts.elementTouched);
            // TODO make sure account is selected
        },

        async accountsCount() {
            const {client} = t.context.app;
            const els = await client.elements(`.list-group.accounts-list > electron-mail-account-title`);

            return els.value.length;
        },

        async openSettingsModal(index?: number) {
            const listGroupSelector = `.modal-body .list-group`;
            const {client} = t.context.app;

            // open modal if not yet opened
            try {
                await client.waitForVisible(listGroupSelector, ONE_SECOND_MS);
            } catch (e) {
                await client.click(`.controls .dropdown-toggle`);
                await client.click(`#optionsMenuItem`);
            }

            // making sure modal is opened TODO consider test by url too
            await client.waitForVisible(listGroupSelector);

            if (typeof index === "undefined") {
                return;
            }

            await client.click(`${listGroupSelector} .list-group-item-action:nth-child(${index + 1})`);

            if (index === 0) {
                await client.waitForVisible(`.modal-body electron-mail-accounts`);
            }
        },

        async closeSettingsModal() {
            const {client} = t.context.app;

            await client.click(`button.close`);
            await client.pause(CONF.timeouts.elementTouched);

            // making sure modal is closed (consider testing by DOM scanning)
            t.is(
                await workflow.getLocationHash(), "/(accounts-outlet:accounts)",
                `addAccount: "accounts" page url (settings modal closed)`,
            );
        },

        async logout() {
            const {client} = t.context.app;
            let selector = "";

            await client.waitForVisible(selector = `electron-mail-accounts .controls .dropdown-toggle`);
            await client.click(selector);
            await client.waitForVisible(selector = `#logoutMenuItem`);
            await workflow._click(selector);

            await (async () => {
                selector = `#loginFormPasswordControl`;
                const timeout = CONF.timeouts.logout;
                try {
                    await t.context.app.client.waitForVisible(selector, timeout);
                } catch (error) {
                    await saveScreenshot(t);
                    t.fail(`Failed to resolve "${selector}" element within ${timeout}ms`);
                    throw error;
                }
            })();

            await workflow.loginPageUrlTest(`logout: login page url`);

            await client.pause(CONF.timeouts.transition);
        },

        async getLocationHash(): Promise<string> {
            const url = await t.context.app.client.getUrl();
            return String(url.split("#").pop());
        },
    };

    return workflow;
}

export async function catchError(t: ExecutionContext<TestContext>, error?: Error) {
    try {
        await saveScreenshot(t);
    } catch {
        // NOOP
    }

    await printElectronLogs(t);

    if (typeof error !== "undefined") {
        throw error;
    }
}

export async function saveScreenshot(t: ExecutionContext<TestContext>) {
    if (!t.context.app || !t.context.app.browserWindow) {
        return;
    }

    const file = path.join(
        t.context.outputDirPath,
        `sreenshot-${t.title}-${new Date().toISOString()}.png`.replace(/[^A-Za-z0-9\.]/g, "_"),
    );
    const image = await t.context.app.browserWindow.capturePage();

    await promisify(fs.writeFile)(file, image);

    // tslint:disable-next-line:no-console
    console.info(`Screenshot produced: ${file}`);

    return file;
}

export async function printElectronLogs(t: ExecutionContext<TestContext>) {
    // tslint:disable:no-console
    if (!t.context.app || !t.context.app.client) {
        return;
    }

    await t.context.app.client.getMainProcessLogs()
        .then((logs) => logs.forEach((log) => console.log(log)));

    await t.context.app.client.getRenderProcessLogs()
        .then((logs) => logs.forEach((log) => {

            console.log(log.level);
            console.log(log.message);
            console.log((log as any).source);

        }));
    // tslint:enable:no-console
}

export function accountCssSelector(zeroStartedAccountIndex = 0) {
    return `.list-group.accounts-list > electron-mail-account-title:nth-child(${zeroStartedAccountIndex + 1})`;
}

export function accountBadgeCssSelector(zeroStartedAccountIndex = 0) {
    return `${accountCssSelector(zeroStartedAccountIndex)} .badge`;
}

function mkOutputDirs(dirs: string[]) {
    dirs.forEach((dir) => fsExtra.ensureDirSync(dir));
}

function resolveEntryUrlIndexByValue(accountType: AccountType, valueCriteria: string): number {
    const index = ACCOUNTS_CONFIG[accountType].entryUrl.findIndex(({value}) => value === valueCriteria);

    if (index === -1) {
        throw new Error(`Failed to resolve entry url index by "${valueCriteria}" value and "${accountType}" account type`);
    }

    return index;
}
