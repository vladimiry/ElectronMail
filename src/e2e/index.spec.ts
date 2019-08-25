// TODO remove the "tslint:disable:await-promise" when Spectron gets proper declaration files, track of the following issues:
// - https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25186
// - https://github.com/electron/spectron/issues/358

// tslint:disable:await-promise

import byline from "byline";
import fs from "fs";
import path from "path";
import psNode from "ps-node"; // see also https://www.npmjs.com/package/find-process
import psTree from "ps-tree";
import {ExecutionContext} from "ava";
import {promisify} from "util";

import {ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {CI, ENV, PROJECT_NAME, TestContext, initApp, saveScreenshot, test} from "./workflow";
import {Config} from "src/shared/model/options";
import {ONE_SECOND_MS} from "src/shared/constants";
import {asyncDelay} from "src/shared/util";

test.serial("general actions: app start, master password setup, add accounts, logout, auto login", async (t) => {
    // setup and login
    await (async () => {
        const workflow = await initApp(t, {initial: true});

        // screenshot with user agent clearly displayed
        await saveScreenshot(t);

        // setup and logout
        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({
            type: "protonmail",
            entryUrlValue: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://app.protonmail.ch`,
        });
        await workflow.addAccount({
            type: "protonmail",
            entryUrlValue: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://mail.protonmail.com`,
        });
        await workflow.addAccount({ // no online .onion domain loading, but offline works
            type: "protonmail",
            entryUrlValue: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://protonirockerxow.onion`,
        });
        await workflow.addAccount({
            type: "tutanota",
            entryUrlValue: `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}https://mail.tutanota.com`,
        });
        await workflow.logout();

        // login with password saving
        await workflow.login({setup: false, savePassword: true});
        await workflow.afterLoginUrlTest("explicit-login-passwordSave");
        await workflow.destroyApp();
    })();

    // auto login 1
    await (async () => {
        const workflow = await initApp(t, {initial: false});
        await workflow.afterLoginUrlTest(("auto-login-1"));
        await workflow.destroyApp();
    })();

    // auto login 2, making sure previous auto login step didn't remove saved password
    await (async () => {
        const workflow = await initApp(t, {initial: false});
        await workflow.afterLoginUrlTest(("auto-login-2"));
        await workflow.logout();
        await workflow.destroyApp();
    })();

    await afterEach(t);
});

test.serial("auto logout", async (t) => {
    const workflow = await initApp(t, {initial: true});
    await workflow.login({setup: true, savePassword: false});
    await workflow.logout();

    const configFile = path.join(t.context.userDataDirPath, "config.json");
    const configFileData: Config = JSON.parse(fs.readFileSync(configFile).toString());
    const idleTimeLogOutSec = 10;

    configFileData.startMinimized = true;
    configFileData.idleTimeLogOutSec = idleTimeLogOutSec;
    fs.writeFileSync(configFile, JSON.stringify(configFileData, null, 2));

    await workflow.login({setup: false, savePassword: false});
    await asyncDelay(idleTimeLogOutSec * ONE_SECOND_MS * 1.5);
    await workflow.loginPageUrlTest("auto-logout");
    await workflow.destroyApp();

    await afterEach(t);
});

async function afterEach(t: ExecutionContext<TestContext>) {
    if (fs.existsSync(t.context.logFilePath)) {
        await new Promise((resolve, reject) => {
            const stream = byline.createStream(
                fs.createReadStream(t.context.logFilePath),
            );
            stream.on("data", (_, line = String(_)) => {
                if (
                    (
                        line.includes("[electron-rpc-api]")
                        &&
                        line.includes(`Object has been destroyed: "sender"`)
                    )
                    ||
                    (
                        line.includes(`failed to resolve window bounds`)
                        &&
                        line.includes("Object has been destroyed")
                    )
                ) {
                    return;
                }
                line = null; // WARN: don't print log line
                t.fail(`App log file error line`);
            });
            stream.on("error", reject);
            stream.on("end", resolve);
        });
    }

    // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
    const rawSettings = promisify(fs.readFile)(path.join(t.context.userDataDirPath, "settings.bin"));
    t.true(rawSettings.toString().indexOf(ENV.loginPrefix) === -1);
}

test.beforeEach(async (t) => {
    t.context.testStatus = "initial";
});

test.afterEach(async (t) => {
    t.context.testStatus = "success";
});

test.afterEach.always(async (t) => {
    if (t.context.testStatus !== "success") {
        await saveScreenshot(t);
    }

    if (!CI) {
        return;
    }

    // kill processes to avoid appveyor error during preparing logs for uploading:
    // The process cannot access the file because it is being used by another process: output\e2e\1545563294836\chrome-driver.log
    // HINT: add "- ps: Get-Process" line to appveyor.yml to list the processes
    const processes: Array<{ pid: number }> = await Promise.all(
        [
            {command: PROJECT_NAME}, {arguments: PROJECT_NAME},
            {command: "node.exe"}, {arguments: "keytar"},
            {command: "node.exe"}, {arguments: "keytar.node"},
            {command: "electron"}, {arguments: "electron"},
            {command: "chrome"}, {arguments: "chrome"},
            {command: "webdriver"}, {arguments: "webdriver"},
            {command: "chrome-driver"}, {arguments: "chrome-driver"},
            {arguments: "log"},
            {arguments: "e2e"},
            {arguments: "keytar.node"},
            {arguments: "keytar"},
        ].map((criteria) => promisify(psNode.lookup)(criteria)),
    );
    await (async () => {
        for (const {pid} of processes) {
            try {
                await killSelfAndChildrenProcesses(pid);
            } catch {
                // NOOP
            }
        }
    })();

    async function killSelfAndChildrenProcesses(pid: number) {
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
    }
});
