import fs from "fs";
import path from "path";
import {Application} from "spectron";
import {ExecutionContext} from "ava";
import {pick} from "remeda";
import {promisify} from "util";

import {TestContext} from "src/e2e/workflow";

const waitFor = async (
    client: DeepReadonly<Application["client"]>,
    actionType: "waitForEnabled" | "waitForClickable" | "waitForDisplayed",
    selector: string,
    options: {
        readonly timeout?: Required<WebdriverIO.WaitForOptions>["timeout"];
        readonly callback?: (el: WebdriverIO.Element) => Promise<void>;
    } = {},
): Promise<WebdriverIO.Element> => {
    const el = await client.$(selector);

    await el[actionType](options);

    if (options.callback) {
        await options.callback(el);
    }

    return el;
};

export const waitForEnabled = async (
    client: Parameters<typeof waitFor>[0],
    selector: Parameters<typeof waitFor>[2],
    options: Parameters<typeof waitFor>[3] = {},
): Promise<WebdriverIO.Element> => {
    return waitFor(client, "waitForEnabled", selector, options);
};

export const waitForClickable: typeof waitForEnabled = async (client, selector, options) => {
    return waitFor(client, "waitForClickable", selector, options);
};

export const waitForDisplayed: typeof waitForEnabled = async (client, selector, options) => {
    return waitFor(client, "waitForDisplayed", selector, options);
};

export async function saveScreenshot(t: ExecutionContext<TestContext>): Promise<string | void> {
    if (true) { // eslint-disable-line no-constant-condition
        // TODO get back "saveScreenshot" implementation
        return;
    }

    if (!t.context.app || !t.context.app.browserWindow) { // lgtm [js/unreachable-statement]
        return;
    }

    const file = path.join(
        t.context.outputDirPath,
        `sreenshot-${t.title}-${new Date().toISOString()}.png`.replace(/[^A-Za-z0-9.]/g, "_"),
    );
    const image = await t.context.app.browserWindow.capturePage();

    await promisify(fs.writeFile)(file, image);

    // eslint-disable-next-line no-console
    console.info(`Screenshot produced: ${file}`);

    return file;
}

export async function printElectronLogs(t: ExecutionContext<TestContext>): Promise<void> {
    if (!t.context.app || !t.context.app.client) {
        return;
    }

    await t.context.app.client.getMainProcessLogs()
        .then((logs) => {
            logs.forEach((log) => {
                console.log(log); // eslint-disable-line no-console
            });
        });

    await t.context.app.client.getRenderProcessLogs()
        .then((logs) => logs.forEach((log) => {
            console.log( // eslint-disable-line no-console
                JSON.stringify(
                    pick(
                        (log as any), // eslint-disable-line @typescript-eslint/no-explicit-any
                        ["level", "message", "source"],
                    ),
                )
            );
        }));
}

export async function catchError(t: ExecutionContext<TestContext>, error?: Error): Promise<void> {
    try {
        await saveScreenshot(t);
    } catch {
        // NOOP
    }

    await printElectronLogs(t);

    if (typeof error !== "undefined") {
        throw error;
    }
}

export function accountCssSelector(zeroStartedAccountIndex = 0): string {
    return `.list-group.accounts-list > electron-mail-account-title:nth-child(${zeroStartedAccountIndex + 1})`;
}

export function accountBadgeCssSelector(zeroStartedAccountIndex = 0): string {
    return `${accountCssSelector(zeroStartedAccountIndex)} .badge`;
}
