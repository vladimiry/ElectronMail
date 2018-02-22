import * as fs from "fs";
import * as path from "path";
import {promisify} from "util";
import test from "ava";

import {actions, catchError, CONF, ENV, initApp, TestContext} from "./util";

test.beforeEach(async (t: TestContext) => {
    await initApp(t, {initial: true});
});

test.afterEach.always(actions.destroyApp.bind(actions));

test("login, add account, logout, auto login", async (t: TestContext) => {
    try {
        await (async () => {
            const client = t.context.app.client;

            await client.pause(CONF.timeouts.transition);

            await actions.login(t, {setup: true, savePassword: false});
            await client.pause(CONF.timeouts.transition);

            await actions.addAccount(t); // TODO make sure there is 1 account added
            await client.pause(CONF.timeouts.transition);

            await actions.logout(t);
            await client.pause(CONF.timeouts.transition);

            await actions.login(t, {setup: false, savePassword: true});
            await client.pause(CONF.timeouts.transition);

            t.is(
                (await client.getUrl()).split("#").pop(), "/(accounts-outlet:accounts)",
                `login: "accounts" page url`,
            );
            // TODO make sure there is 1 account added

            await actions.destroyApp(t);
        })();

        await initApp(t, {initial: false});
        await t.context.app.client.pause(CONF.timeouts.transition + CONF.timeouts.encryption);

        t.is(
            (await t.context.app.client.getUrl()).split("#").pop(), "/(accounts-outlet:accounts)",
            `root: "accounts" page url`,
        );

        // making sure log file has not been created (no errors happened)
        t.false(fs.existsSync(t.context.logFilePath), `"${t.context.logFilePath}" file should not exist`);

        // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
        const rawSettings = promisify(fs.readFile)(path.join(t.context.userDataDirPath, "settings.bin"));
        t.true(rawSettings.toString().indexOf(ENV.login) === -1);
    } catch (error) {
        await catchError(t, error);
    }
});
