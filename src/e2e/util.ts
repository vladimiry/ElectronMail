// TODO enabel "tslint:await-promise" rule
// tslint:disable:await-promise

import * as fs from "fs";
import * as path from "path";
import * as mkdirp from "mkdirp";
import * as electron from "electron";
import * as randomString from "randomstring";
import * as psNode from "ps-node"; // see also https://www.npmjs.com/package/find-process
import * as psTree from "ps-tree";
import {promisify} from "util";
import anyTest, {ExecutionContext, TestInterface} from "ava";
import {Application} from "spectron";

import {Environment} from "_shared/model/electron";

export interface TestContext {
    app: Application;
    outputDirPath: string;
    userDataDirPath: string;
    appDirPath: string;
    logFilePath: string;
}

export const test = anyTest as TestInterface<TestContext>;

const rootDirPath = path.resolve(__dirname, process.cwd());
const appDirPath = path.join(rootDirPath, "./app");
const mainScriptFilePath = path.join(appDirPath, "./electron/main/index.js");

export const ENV = {
    masterPassword: `master-password-${randomString.generate({length: 8})}`,
    loginPrefix: `login-${randomString.generate({length: 8})}`,
};
export const CONF = {
    timeouts: {
        element: 700,
        elementTouched: 300,
        encryption: process.env.CI ? 5000 : 1000,
        transition: process.env.CI ? 2000 : 500,
    },
};

let loginPrefixCount = 0;

async function mkOutputDirs(dirs: string[]) {
    dirs.forEach((dir) => promisify(mkdirp)(dir));
}

export async function initApp(t: ExecutionContext<TestContext>, options: { initial: boolean }) {
    try {
        const outputDirPath = t.context.outputDirPath = t.context.outputDirPath
            || path.join(rootDirPath, "./output/e2e", String(Number(new Date())));
        const userDataDirPath = path.join(outputDirPath, "./app-data");
        const logFilePath = path.join(userDataDirPath, "log.log");
        const webdriverLogDirPath = path.join(outputDirPath, "webdriver-driver-log");
        const chromeDriverLogFilePath = path.join(outputDirPath, "chrome-driver.log");

        await mkOutputDirs([
            outputDirPath,
            userDataDirPath,
            webdriverLogDirPath,
        ]);

        t.context.appDirPath = appDirPath;
        t.context.userDataDirPath = userDataDirPath;
        t.context.logFilePath = logFilePath;

        const missedFiles = (["production", "development", "e2e"] as Environment[])
            .map((env) => `./electron/renderer/browser-window-${env}-env.js`)
            .concat([
                "./electron/renderer/account.js",
                "./web/index.html",
                "./assets/icons/icon.png",
            ])
            .map((file) => path.join(t.context.appDirPath, file))
            .map((file) => {
                const exists = fs.existsSync(file);
                t.true(exists, `"${file}" file doesn't exist`);
                return exists;
            })
            .filter((exists) => !exists)
            .length > 0;

        if (missedFiles) {
            t.fail("Not all the required files exist");
            return;
        }

        if (options.initial) {
            t.false(fs.existsSync(path.join(userDataDirPath, "config.json")),
                `"config.json" should not exist yet in "${userDataDirPath}"`);
            t.false(fs.existsSync(path.join(userDataDirPath, "settings.bin")),
                `"settings.bin" should not exist yet in "${userDataDirPath}"`);
        }

        t.context.app = new Application({
            path: electron as any,
            requireName: "electronRequire",
            env: {
                NODE_ENV_RUNTIME: "e2e",
                TEST_USER_DATA_DIR: userDataDirPath,
            },
            args: [mainScriptFilePath],
            // chromeDriverArgs: process.env.CI ? [/*"headless", */"no-sandbox", "disable-gpu"] : [],
            webdriverLogPath: webdriverLogDirPath,
            chromeDriverLogPath: chromeDriverLogFilePath,

            // TODO consider running e2e tests on compiled/binary app too
            // path: path.join(rootPath, "./dist/linux-unpacked/protonmail-desktop-app"),

            startTimeout: 60000,
        });

        await t.context.app.start();
        t.is(t.context.app.isRunning(), true);

        await t.context.app.client.waitUntilWindowLoaded();

        await (async () => {
            const browserWindow = t.context.app.browserWindow;

            // t.false(await browserWindow.webContents.isDevToolsOpened(), "dev tools closed");
            t.false(await (browserWindow as any).isDevToolsOpened(), "browserWindow: dev tools closed");
            t.false(await browserWindow.isMinimized(), "browserWindow: not minimized");

            if (options.initial) {
                t.true(await browserWindow.isVisible(), "browserWindow: visible");
                t.true(await browserWindow.isFocused(), "browserWindow: focused");
            } else {
                t.false(await browserWindow.isVisible(), "browserWindow: not visible");
                t.false(await browserWindow.isFocused(), "browserWindow: not focused");
            }

            const {width, height} = await browserWindow.getBounds();
            t.true(width > 0, "window width > 0");
            t.true(height > 0, "window height > 0");
        })();

        // await awaitAngular(t.context.app.client); // seems to be not needed
        // await t.context.app.client.pause(2000);
    } catch (error) {
        if (error.message.indexOf("The inAppPurchase module can only be used on macOS") !== -1) {
            // tslint:disable:no-console
            console.warn(error.message);
            // tslint:enable:no-console
            await catchError(t);
        } else {
            throw error;
        }
    }
}

export const actions = {
    async destroyApp(t: ExecutionContext<TestContext>) {
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

    async login(t: ExecutionContext<TestContext>, options: { setup: boolean, savePassword: boolean }) {
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

            await this.closeSettingsModal(t);
        }

        await client.pause(CONF.timeouts.transition);
    },

    async addAccount(t: ExecutionContext<TestContext>, account?: { login: string; password: string; }) {
        const client = t.context.app.client;
        const login = account
            ? account.login
            : `${ENV.loginPrefix}-${loginPrefixCount++}`;

        await this.openSettingsModal(t, 0);

        await client.click(`.modal-body protonmail-desktop-app-accounts > a:nth-child(1)`); // TODO select by link's text - Add Account
        await client.setValue(`[formcontrolname=login]`, login);
        await client.pause(CONF.timeouts.elementTouched);

        if (account) {
            await client.setValue(`[formcontrolname=password]`, account.password);
            await client.pause(CONF.timeouts.elementTouched);
        }

        await client.click(`button[type="submit"]`);
        await client.pause(CONF.timeouts.encryption);

        t.is(
            (await client.getUrl()).split("#").pop(),
            `/(settings-outlet:settings/account-edit//accounts-outlet:accounts)?login=${login}`,
            `addAccount: "accounts?login=${login}" page url`,
        );
        await this.closeSettingsModal(t);
        await client.pause(CONF.timeouts.transition);
    },

    async selectAccount(t: ExecutionContext<TestContext>, index = 0) {
        const client = t.context.app.client;

        await client.click(`.list-group.accounts-list > .list-group-item:nth-child(${index + 1}) protonmail-desktop-app-account-title`);
        // TODO make sure account is selected and loaded
    },

    async accountsCount(t: ExecutionContext<TestContext>) {
        const client = t.context.app.client;
        const els = await client.elements(`.list-group.accounts-list > .list-group-item-action > protonmail-desktop-app-account-title`);

        return els.value.length;
    },

    async openSettingsModal(t: ExecutionContext<TestContext>, index?: number) {
        const listGroupSelector = `.modal-body .list-group`;
        const client = t.context.app.client;

        await client.click(`.controls .dropdown-toggle`);
        await client.click(`#optionsMenuItem`);
        await client.pause(CONF.timeouts.elementTouched);

        // making sure modal is opened (consider testing by url)
        await client.waitForVisible(listGroupSelector);

        if (typeof index !== "undefined") {
            await client.click(`${listGroupSelector} .list-group-item-action:nth-child(${index + 1})`);

            if (index === 0) {
                await client.waitForVisible(`.modal-body protonmail-desktop-app-accounts`);
            }
        }
    },

    async closeSettingsModal(t: ExecutionContext<TestContext>) {
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

    async logout(t: ExecutionContext<TestContext>) {
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
