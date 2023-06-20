import fs from "fs";
import path from "path";

import {asyncDelay} from "src/shared/util";
import {Config} from "src/shared/model/options";
import {initAppWithTestContext} from "src/e2e/lib/init-app";
import {IS_CI} from "src/e2e/lib/const";
import {ONE_SECOND_MS} from "src/shared/const";
import {PROTON_API_ENTRY_URLS} from "src/shared/const/proton-url";
import {test} from "./lib/test";

test("general actions: app start, master password setup, add accounts", async () => {
    await initAppWithTestContext({initial: true}, async ({workflow}) => {
        await workflow.saveScreenshot(); // screenshot with user agent clearly displayed at this point
        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({entryUrlValue: PROTON_API_ENTRY_URLS[0]});
        await workflow.logout();
    });
});

test("auto logout", async () => {
    await initAppWithTestContext({initial: true}, async (testContext) => {
        await testContext.workflow.login({setup: true, savePassword: false});
        await testContext.workflow.logout();

        const configFile = path.join(testContext.userDataDirPath, "config.json");
        const configFileData = JSON.parse(fs.readFileSync(configFile).toString()) as Config;
        const idleTimeLogOutSec = 10;

        configFileData.startHidden = true;
        configFileData.idleTimeLogOutSec = idleTimeLogOutSec;
        fs.writeFileSync(configFile, JSON.stringify(configFileData, null, 2));

        await testContext.workflow.login({setup: false, savePassword: false});
        await asyncDelay(idleTimeLogOutSec * ONE_SECOND_MS * 1.5);
        await testContext.workflow.loginPageUrlTest("auto-logout");
    });
});

if (IS_CI) {
    test("auto login", async () => {
        let initial = true;
        const testContext = await initAppWithTestContext({initial, allowDestroyedExecutionContext: true}, async ({workflow}) => {
            await workflow.login({setup: true, savePassword: true});
            await workflow.afterLoginUrlTest("initial login");
            const [firstEntryUrlValue] = PROTON_API_ENTRY_URLS;
            await workflow.addAccount({entryUrlValue: firstEntryUrlValue});
            // no "logout" action performed so the saved password doesn't get removed
        });
        { // auto login 1
            initial = false;
            await initAppWithTestContext({testContext, initial, allowDestroyedExecutionContext: true}, async ({workflow}) => {
                await workflow.afterLoginUrlTest("auto login 1", {hiddenWindow: !initial});
                // no "logout" action performed so the saved password doesn't get removed
            });
        }
        { // auto login 2, making sure previous auto login step didn't remove saved password (exited by: exit/destroy)
            initial = false;
            await initAppWithTestContext({testContext, initial}, async ({workflow}) => {
                const initial = false;
                await workflow.afterLoginUrlTest("auto login 2", {hiddenWindow: !initial});
                await workflow.logout({hiddenWindow: !initial});
            });
        }
        { // making sure previous step has removed the saved password (exited by: logout)
            initial = false;
            await initAppWithTestContext({testContext, initial}, async ({workflow}) => {
                await workflow.afterLoginUrlTest("auto login: final step 1", {hiddenWindow: !initial, expectLoginPage: true});
                await workflow.login({setup: false, savePassword: false, hiddenWindow: !initial});
                await workflow.afterLoginUrlTest("auto login: final step 2", {hiddenWindow: !initial});
            });
        }
    });
}
