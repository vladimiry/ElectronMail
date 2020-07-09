import byline from "byline";
import fs from "fs";
import path from "path";
import psNode from "ps-node"; // see also https://www.npmjs.com/package/find-process
import psTree from "ps-tree";
import {ExecutionContext} from "ava";
import {promisify} from "util";

import {CI, ENV, PROJECT_NAME, TestContext, initApp, test} from "./workflow";
import {Config} from "src/shared/model/options";
import {ONE_SECOND_MS, PROTON_API_ENTRY_URLS} from "src/shared/constants";
import {asyncDelay} from "src/shared/util";
import {saveScreenshot} from "src/e2e/lib";

async function afterEach(t: ExecutionContext<TestContext>): Promise<void> {
    if (fs.existsSync(t.context.logFilePath)) {
        await new Promise((resolve, reject) => {
            const stream = byline.createStream(
                fs.createReadStream(t.context.logFilePath),
            );
            stream.on("data", (_, line = String(_)) => {
                if (
                    line.includes("keytar")
                    ||
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

test.serial("general actions: app start, master password setup, add accounts", async (t) => {
    const app = await initApp(t, {initial: true});

    // screenshot with user agent clearly displayed
    await saveScreenshot(t);

    await app.login({setup: true, savePassword: false});

    for (const entryUrlValue of PROTON_API_ENTRY_URLS) {
        await app.addAccount({entryUrlValue});
    }

    await app.logout();

    await app.destroyApp();

    await afterEach(t);
});

if (
    CI
    &&
    Boolean(0) // TODO proton-v4: enable "auto login" e2e test scenario
) {
    test.serial("auto login", async (t) => {
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: true});
            await app.login({setup: true, savePassword: true});
            await app.afterLoginUrlTest("initial login");
            await app.logout();
            await app.destroyApp();
        })();

        // auto login 1
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: false});
            await app.afterLoginUrlTest(("auto login 1"));
            await app.logout();
            await app.destroyApp();
        })();

        // auto login 2, making sure previous auto login step didn't remove saved password
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: false});
            await app.afterLoginUrlTest(("auto login 2"));
            await app.logout();
            await app.destroyApp();
        })();

        await afterEach(t);
    });
}

test.serial("auto logout", async (t) => {
    const app = await initApp(t, {initial: true});
    await app.login({setup: true, savePassword: false});
    await app.logout();

    const configFile = path.join(t.context.userDataDirPath, "config.json");
    const configFileData = JSON.parse(fs.readFileSync(configFile).toString()) as Config;
    const idleTimeLogOutSec = 10;

    configFileData.startHidden = true;
    configFileData.idleTimeLogOutSec = idleTimeLogOutSec;
    fs.writeFileSync(configFile, JSON.stringify(configFileData, null, 2));

    await app.login({setup: false, savePassword: false});
    await asyncDelay(idleTimeLogOutSec * ONE_SECOND_MS * 1.5);
    await app.loginPageUrlTest("auto-logout");

    await app.destroyApp();

    await afterEach(t);
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
    // HINT: add "- ps: Get-Process" line to appveyor.yml to list the processes
    const processes: Array<{ pid: number }> = await Promise.all( // eslint-disable-line @typescript-eslint/no-unsafe-assignment
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
        ].map((criteria) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
            return promisify(psNode.lookup)(criteria);
        }),
    );

    async function killSelfAndChildrenProcesses(pid: number): Promise<void> {
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

    await (async (): Promise<void> => {
        for (const {pid} of processes) {
            try {
                await killSelfAndChildrenProcesses(pid);
            } catch {
                // NOOP
            }
        }
    })();
});
