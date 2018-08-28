// TODO remove the "tslint:disable:await-promise" when spectron gets proper declaration files
// TODO track this issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25186
// tslint:disable:await-promise

import electron from "electron";
import fs from "fs";
import mkdirp from "mkdirp";
import path from "path";
import psNode from "ps-node"; // see also https://www.npmjs.com/package/find-process
import psTree from "ps-tree";
import randomString from "randomstring";
import sinon from "sinon";
import ava, {ExecutionContext, TestInterface} from "ava";
import {Application} from "spectron";
import {promisify} from "util";

import {ACCOUNTS_CONFIG, ONE_SECOND_MS, RUNTIME_ENV_E2E, RUNTIME_ENV_USER_DATA_DIR} from "src/shared/constants";
import {AccountType} from "src/shared/model/account";

export interface TestContext {
    app: Application;
    outputDirPath: string;
    userDataDirPath: string;
    appDirPath: string;
    logFilePath: string;
    workflow: ReturnType<typeof buildWorkflow>;
    sinon: {
        addAccountSpy: sinon.SinonSpy;
    };
}

export const test = ava as TestInterface<TestContext>;
export const ENV = {
    masterPassword: `master-password-${randomString.generate({length: 8})}`,
    loginPrefix: `login-${randomString.generate({length: 8})}`,
};
export const {CI} = process.env;

const rootDirPath = path.resolve(__dirname, process.cwd());
const appDirPath = path.join(rootDirPath, "./app");
const mainScriptFilePath = path.join(appDirPath, "./electron-main.js");
const CONF = {
    timeouts: {
        element: ONE_SECOND_MS,
        elementTouched: ONE_SECOND_MS * 0.3,
        encryption: ONE_SECOND_MS * (CI ? 5 : 1.5),
        transition: ONE_SECOND_MS * (CI ? 1 : 0.3),
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

    const outputDirPath = t.context.outputDirPath = t.context.outputDirPath
        || path.join(rootDirPath, "./output/e2e", String(Number(new Date())));
    const userDataDirPath = path.join(outputDirPath, "./app-data");
    const logFilePath = path.join(userDataDirPath, "log.log");
    // const webdriverLogDirPath = path.join(outputDirPath, "webdriver-driver-log");
    // const chromeDriverLogFilePath = path.join(outputDirPath, "chrome-driver.log");

    await mkOutputDirs([
        outputDirPath,
        userDataDirPath,
        // webdriverLogDirPath,
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
        // TODO consider running e2e tests on compiled/binary app too
        // path: path.join(rootPath, "./dist/linux-unpacked/email-securely-app"),
        path: electron as any,
        requireName: "electronRequire",
        env: {
            [RUNTIME_ENV_E2E]: String(true),
            [RUNTIME_ENV_USER_DATA_DIR]: userDataDirPath,
        },
        args: [mainScriptFilePath],

        // ...(CI ? {
        //     startTimeout: 30000,
        //     chromeDriverArgs: [/*"headless",*/"no-sandbox", "disable-gpu"],
        // } : {}),

        // TODO setting path chromedriver config parameters might cause the following errors happening:
        // - ChromeDriver did not start within 5000ms
        // - Failed to redirect stderr to log file.
        // - Unable to initialize logging. Exiting...
        // webdriverLogPath: webdriverLogDirPath,
        // chromeDriverLogPath: chromeDriverLogFilePath,
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
    // t.false(await browserWindow.webContents.isDevToolsOpened(), "browserWindow's dev tools should be closed");
    t.false(await (browserWindow as any).isDevToolsOpened(), "window'd dev tools should be closed");
    t.false(await browserWindow.isMinimized(), "window should not be not minimized");
    if (options.initial) {
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
            // TODO update to electron 2: app.isRunning() returns undefined, uncomment as soon as it's fixed
            // if (!t.context.app || !t.context.app.isRunning()) {
            //     t.pass("app is not running");
            //     return;
            // }
            // await t.context.app.stop();
            // t.is(t.context.app.isRunning(), false);
            // delete t.context.app;

            // TODO update to electron 2: remove as soon as app.isRunning() returns valid value
            await (async () => {
                const processes = await promisify(psNode.lookup)({
                    command: "electron",
                    // arguments: mainScriptFilePath.replace(/\\/g, "\\\\"),
                    arguments: "--enable-automation",
                });
                const pid = processes.length && processes.pop().pid;

                if (!pid) {
                    throw new Error("Filed to lookup process Electron root process to kill");
                }

                const processesToKill = [
                    ...(await promisify(psTree)(pid)),
                    {PID: pid},
                ];

                for (const {PID} of processesToKill) {
                    try {
                        process.kill(Number(PID), "SIGKILL");
                    } catch {
                        // NOOP
                    }
                }
            })();
        },

        async login(options: { setup: boolean, savePassword: boolean }) {
            const client = t.context.app.client;
            let selector: string | null = null;

            await client.pause(CONF.timeouts.transition);

            if (options.setup) {
                t.is(
                    (await client.getUrl()).split("#").pop(), "/(settings-outlet:settings/settings-setup)",
                    `login: "settings-setup" page url`,
                );
            } else {
                t.is(
                    (await client.getUrl()).split("#").pop(), "/(settings-outlet:settings/login//accounts-outlet:accounts)",
                    `login: "settings-setup" page url`,
                );
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
            await client.pause(CONF.timeouts.encryption);

            if (options.setup) {
                t.is(
                    (await client.getUrl()).split("#").pop(), "/(settings-outlet:settings/account-edit//accounts-outlet:accounts)",
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
            t.is(
                (await t.context.app.client.getUrl()).split("#").pop(),
                "/(accounts-outlet:accounts)", `workflow.${workflowPrefix}: "accounts" page url`,
            );
        },

        async addAccount(account: { type: AccountType, login?: string; password?: string; twoFactorCode?: string; }) {
            const client = t.context.app.client;
            const login = account.login
                ? account.login
                : `${ENV.loginPrefix}-${GLOBAL_STATE.loginPrefixCount++}`;

            await workflow.openSettingsModal(0);

            // select adding account menu item
            await client.click(`#goToAccountsSettingsLink`);

            // required: type
            await client.click(`#accountEditFormTypeField`);
            await client.pause(CONF.timeouts.elementTouched);
            await client.click(`.ng-option-label=${account.type}`);
            await client.pause(CONF.timeouts.elementTouched);

            // required: entryUrl
            await client.click(`#accountEditFormEntryUrlField`);
            await client.pause(CONF.timeouts.elementTouched);
            await client.click(`.ng-option-label=${ACCOUNTS_CONFIG[account.type].entryUrl[0].value}`);
            await client.pause(CONF.timeouts.elementTouched);

            // required: login
            await client.setValue(`[formcontrolname=login]`, login);
            await client.pause(CONF.timeouts.elementTouched);

            if (account.password) {
                await client.setValue(`[formcontrolname=password]`, account.password);
                await client.pause(CONF.timeouts.elementTouched);
            }

            if (account.twoFactorCode) {
                await client.setValue(`[formcontrolname=twoFactorCode]`, account.twoFactorCode);
                await client.pause(CONF.timeouts.elementTouched);
            }

            await client.click(`button[type="submit"]`);
            await client.pause(CONF.timeouts.encryption);

            t.is(
                (await client.getUrl()).split("#").pop(),
                `/(settings-outlet:settings/account-edit//accounts-outlet:accounts)?login=${login}`,
                `addAccount: "accounts?login=${login}" page url`,
            );
            await workflow.closeSettingsModal();
            await client.pause(CONF.timeouts.encryption);
        },

        async selectAccount(zeroStartedAccountIndex = 0) {
            const client = t.context.app.client;

            await client.click(accountCssSelector(zeroStartedAccountIndex));
            // TODO make sure account is selected and loaded
        },

        async accountsCount() {
            const client = t.context.app.client;
            const els = await client.elements(`.list-group.accounts-list > .list-group-item-action > email-securely-app-account-title`);

            return els.value.length;
        },

        async openSettingsModal(index?: number) {
            const listGroupSelector = `.modal-body .list-group`;
            const client = t.context.app.client;

            await client.click(`.controls .dropdown-toggle`);
            await client.click(`#optionsMenuItem`);
            await client.pause(CONF.timeouts.elementTouched);

            // making sure modal is opened (consider testing by url)
            await client.waitForVisible(listGroupSelector);

            if (typeof index === "undefined") {
                return;
            }

            await client.click(`${listGroupSelector} .list-group-item-action:nth-child(${index + 1})`);

            if (index === 0) {
                await client.waitForVisible(`.modal-body email-securely-app-accounts`);
            }
        },

        async closeSettingsModal() {
            const client = t.context.app.client;

            await client.click(`button.close`);
            await client.pause(CONF.timeouts.elementTouched);

            // making sure modal is closed (consider testing by DOM scanning)
            t.is(
                (await client.getUrl()).split("#").pop(),
                "/(accounts-outlet:accounts)",
                `addAccount: "accounts" page url (settings modal closed)`,
            );
        },

        async logout() {
            const client = t.context.app.client;

            await client.click(`.controls .dropdown-toggle`);
            await client.click(`#logoutMenuItem`);
            await client.pause(CONF.timeouts.elementTouched);

            t.is(
                (await client.getUrl()).split("#").pop(), "/(settings-outlet:settings/login//accounts-outlet:accounts)",
                `logout: login page url`,
            );

            await client.pause(CONF.timeouts.transition);
        },
    };

    return workflow;
}

export async function catchError(t: ExecutionContext<TestContext>, error?: Error) {
    try {
        await t.context.app.client.waitForVisible(`.alert-link`, CONF.timeouts.element);
        await t.context.app.client.click(`.alert-link`);
    } catch {
        // NOOP
    }

    try {
        await saveShot(t);
    } catch {
        // NOOP
    }

    await printElectronLogs(t);

    if (typeof error !== "undefined") {
        throw error;
    }
}

export async function saveShot(t: ExecutionContext<TestContext>) {
    const file = path.join(
        t.context.outputDirPath,
        `sreenshot-${t.title}-${new Date().toISOString()}.png`.replace(/[^A-Za-z0-9\.]/g, "_"),
    );
    const image = await t.context.app.browserWindow.capturePage();

    await promisify(fs.writeFile)(file, image);

    // tslint:disable-next-line:no-console
    console.info(`ErrorShot produced: ${file}`);

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
    return `.list-group.accounts-list > .list-group-item:nth-child(${zeroStartedAccountIndex + 1}) email-securely-app-account-title`;
}

export function accountBadgeCssSelector(zeroStartedAccountIndex = 0) {
    return `${accountCssSelector(zeroStartedAccountIndex)} > .account-value-sync-unread > .badge`;
}

async function mkOutputDirs(dirs: string[]) {
    dirs.forEach((dir) => promisify(mkdirp)(dir));
}
