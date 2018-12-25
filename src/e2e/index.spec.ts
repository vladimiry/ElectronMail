// TODO remove the "tslint:disable:await-promise" when spectron gets proper declaration files
// TODO track this issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25186
// tslint:disable:await-promise

import byline from "byline";
import fs from "fs";
import path from "path";
import psNode from "ps-node"; // see also https://www.npmjs.com/package/find-process
import psTree from "ps-tree";
import {platform} from "os";
import {promisify} from "util";

import {ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {APP_NAME, CI, ENV, initApp, saveScreenshot, test} from "./workflow";

test.serial("general actions: app start, master password setup, add accounts, logout, auto login", async (t) => {
    // setup and login
    await (async () => {
        const workflow = await initApp(t, {initial: true});

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
        // TODO stops on ".login-filled-once" resolving stage if running on linux CI server
        if (!CI || platform() !== "linux") {
            await workflow.addAccount({
                type: "protonmail",
                entryUrlValue: "https://beta.protonmail.com",
            });
        }
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

    if (fs.existsSync(t.context.logFilePath)) {
        await new Promise((resolve, reject) => {
            const stream = byline.createStream(
                fs.createReadStream(t.context.logFilePath),
            );
            stream.on("data", (_, line = String(_)) => {
                if (
                    line.includes("[electron-rpc-api]") &&
                    line.includes(`Object has been destroyed: "sender"`)
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
});

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
    await (async () => {
        // HINT: add "- ps: Get-Process" line to appveyor.yml to list the processes
        const processes: Array<{ pid: number }> = await Promise.all(
            [
                {command: APP_NAME}, {arguments: APP_NAME},
                {command: "electron"}, {arguments: "electron"},
                {command: "chrome"}, {arguments: "chrome"},
                {command: "webdriver"}, {arguments: "webdriver"},
                {command: "chrome-driver"}, {arguments: "chrome-driver"},
                {arguments: "log"},
                {arguments: "e2e"},
            ].map((criteria) => promisify(psNode.lookup)(criteria)),
        );

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
