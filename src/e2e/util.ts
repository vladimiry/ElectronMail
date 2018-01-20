import * as fs from "fs";
import * as path from "path";
import * as mkdirp from "mkdirp";
import * as electron from "electron";
import * as randomString from "randomstring";
import {promisify} from "util";
import {GenericTestContext} from "ava";
import {Application} from "spectron";

import {Environment} from "_shared/model/electron";

export interface TestContext extends GenericTestContext<{
    context: {
        app: Application;
        outputDirPath: string;
        userDataDirPath: string;
        appDirPath: string;
        logFilePath: string;
    };
}> {}

const rootDirPath = path.resolve(__dirname, process.cwd());
const appDirPath = path.join(rootDirPath, "./app");
const mainScriptFilePath = path.join(appDirPath, "./electron/main/index.js");

export const ENV = {
    masterPassword: `master-password-${randomString.generate({length: 8})}`,
    login: `login-${randomString.generate({length: 8})}`,
};
export const CONF = {
    timeouts: {
        element: 700,
        elementTouched: 300,
        encryption: process.env.CI ? 5000 : 1000,
        transition: process.env.CI ? 2000 : 500,
    },
};

async function mkOutputDirs(dirs: string[]) {
    dirs.forEach((dir) => promisify(mkdirp)(dir));
}

export async function initApp(t: TestContext, options: { initial: boolean }) {
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
            args: [mainScriptFilePath],
            // TODO consider running e2e tests on copiled/binary app too
            // path: path.join(rootPath, "./dist/linux-unpacked/protonmail-desktop-app"),
            env: {
                NODE_ENV: "e2e",
                TEST_USER_DATA_DIR: userDataDirPath,
            },
            requireName: "electronRequire",
            webdriverLogPath: webdriverLogDirPath,
            chromeDriverLogPath: chromeDriverLogFilePath,
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
        });

        // await awaitAngular(t.context.app.client); // seems to be not needed
        // await t.context.app.client.pause(2000);
    } catch (error) {
        catchError(t, error);
    }
}

export const actions = {
    async destroyApp(t: TestContext) {
        try {
            if (!t.context.app || !t.context.app.isRunning()) {
                t.pass("app is not running");
                return;
            }

            await t.context.app.stop();
            t.is(t.context.app.isRunning(), false);
            delete t.context.app;
        } catch (error) {
            catchError(t, error);
        }
    },

    async login(t: TestContext, options: { setup: boolean, savePassword: boolean }) {
        const client = t.context.app.client;
        let selector: string | null = null;

        try {
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
            }
        } catch (error) {
            catchError(t, error);
        }
    },

    async addAccount(t: TestContext) {
        const client = t.context.app.client;
        let selector: string | null = null;

        try {
            await client.waitForVisible(selector = `[formcontrolname=login]`, CONF.timeouts.element);
            await client.setValue(selector, ENV.login);
            await client.pause(CONF.timeouts.elementTouched);
            await client.click(selector = `button[type="submit"]`);
            await client.pause(CONF.timeouts.encryption);

            t.is(
                (await client.getUrl()).split("#").pop(),
                `/(settings-outlet:settings/account-edit//accounts-outlet:accounts)?login=${ENV.login}`,
                `addAccount: "accounts?login=${ENV.login}" page url`,
            );
            await client.click(selector = `button.close`);
            await client.pause(CONF.timeouts.elementTouched);

            t.is(
                (await client.getUrl()).split("#").pop(),
                "/(accounts-outlet:accounts)",
                `addAccount: "accounts" page url (settings modal closed)`,
            );
        } catch (error) {
            catchError(t, error);
        }
    },

    async logout(t: TestContext) {
        const client = t.context.app.client;

        try {
            await client.click(`.controls .dropdown-toggle`);
            await client.click(`#logoutButton`);
            await client.pause(CONF.timeouts.elementTouched);

            t.is(
                (await client.getUrl()).split("#").pop(), "/(settings-outlet:settings/login//accounts-outlet:accounts)",
                `logout: login page url`,
            );
        } catch (error) {
            catchError(t, error);
        }
    },
};

export async function catchError(t: TestContext, error?: Error) {
    try {
        try {
            await t.context.app.client.waitForVisible(`.alert-link`, CONF.timeouts.element);
            await t.context.app.client.click(`.alert-link`);
        } catch {
            // NOOP
        }

        await saveShot(t);
    } catch {
        // NOOP
    }

    await printElectronLogs(t);

    if (typeof error !== "undefined") {
        throw error;
    }
}

// tslint:disable:no-console

export async function saveShot(t: TestContext) {
    const file = path.join(
        t.context.outputDirPath,
        `sreenshot-${t.title}-${new Date().toISOString()}.png`.replace(/[^A-Za-z0-9\.]/g, "_"),
    );
    const image = await t.context.app.browserWindow.capturePage();

    promisify(fs.writeFile)(file, image);

    console.info(`ErrorShot produced: ${file}`);

    return file;
}

export function printElectronLogs(t: TestContext) {
    if (!t.context.app || !t.context.app.client) {
        return;
    }

    t.context.app.client.getMainProcessLogs()
        .then((logs) => logs.forEach((log) => console.log(log)));

    t.context.app.client.getRenderProcessLogs()
        .then((logs) => logs.forEach((log) => {
            console.log(log.level);
            console.log(log.message);
            console.log((log as any).source);
        }));
}

// tslint:enable:no-console
