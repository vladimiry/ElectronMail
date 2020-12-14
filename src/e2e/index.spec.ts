import byline from "byline";
import fs from "fs";
import path from "path";
import {ExecutionContext} from "ava";
import {promisify} from "util";

import {CI, ENV, TestContext, initApp, test} from "./workflow";
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

if (CI) { // PLATFORM !== "linux"
    test.serial("auto login", async (t) => {
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: true});
            await app.login({setup: true, savePassword: true});
            await app.afterLoginUrlTest("initial login");
            const [entryUrlValue] = PROTON_API_ENTRY_URLS;
            await app.addAccount({entryUrlValue});
            await app.exit(); // not "logout" but "exit" so the saved password doesn't get removed
            await app.destroyApp();
        })();

        // auto login 1
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: false});
            await app.afterLoginUrlTest(("auto login 1"));
            await app.exit();
            await app.destroyApp();
        })();

        // auto login 2, making sure previous auto login step didn't remove saved password (exited by: exit)
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: false});
            await app.afterLoginUrlTest(("auto login 2"));
            await app.logout();
            await app.destroyApp();
        })();

        // making sure previous step removed the saved password (exited by: logout)
        await (async (): Promise<void> => {
            const app = await initApp(t, {initial: false});
            await app.loginPageUrlTest(("auto login: final step"));
            await app.destroyApp();
        })();

        await afterEach(t);
    });
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
});
