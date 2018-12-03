// TODO remove the "tslint:disable:await-promise" when spectron gets proper declaration files
// TODO track this issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25186
// tslint:disable:await-promise

import fs from "fs";
import path from "path";
import {promisify} from "util";

import {ENV, initApp, test} from "./workflow";

test.serial("general actions: app start, master password setup, add accounts, logout, auto login", async (t) => {
    // setup and login
    await (async () => {
        const workflow = await initApp(t, {initial: true});

        // setup and logout
        await workflow.login({setup: true, savePassword: false});
        await workflow.addAccount({type: "protonmail", entryUrlIndex: 0});
        await workflow.addAccount({type: "protonmail", entryUrlIndex: 3});
        await workflow.addAccount({type: "tutanota"});
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

    // making sure log file has not been created (no errors happened)
    t.false(fs.existsSync(t.context.logFilePath), `"${t.context.logFilePath}" file should not exist`);

    // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
    const rawSettings = promisify(fs.readFile)(path.join(t.context.userDataDirPath, "settings.bin"));
    t.true(rawSettings.toString().indexOf(ENV.loginPrefix) === -1);
});
