import path from "path";
import {ExecutionContext} from "ava";

import {TestContext} from "src/e2e/workflow";

// WARN use only function arguments
// using any external variables/libraries might break things since serialization takes place (funciton executed on the "main" process)
export const mainProcessEvaluationFunctions = {
    resolveBrowserWindow: (
        {BrowserWindow}: typeof import("electron"),
        options: { resolveFocusedWindow?: boolean },
    ): import("electron").BrowserWindow => {
        {
            const actual = typeof options.resolveFocusedWindow;
            const expected = "boolean";
            if (actual !== expected) {
                throw new Error(
                    `Invalid "${String(options.resolveFocusedWindow)}" property type: ${JSON.stringify({actual, expected})}`,
                );
            }
        }
        const window = options.resolveFocusedWindow
            ? BrowserWindow.getFocusedWindow()
            : BrowserWindow.getAllWindows().pop();
        if (!window) {
            throw new Error(`Failed to resolve focused window`);
        }
        return window;
    },
    async testMainProcessSpecificStuff(
        electron: typeof import("electron"),
        options: { initial: boolean, resolveBrowserWindowStringified: string },
    ): Promise<typeof options> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const resolveBrowserWindow: typeof mainProcessEvaluationFunctions.resolveBrowserWindow
            = eval(options.resolveBrowserWindowStringified.toString());
        const firstWindow = resolveBrowserWindow(electron, {resolveFocusedWindow: false});
        if (firstWindow.webContents.isDevToolsOpened()) {
            throw new Error("dev tools should be closed");
        }
        if (firstWindow.isMinimized()) {
            throw new Error("window should not be not minimized");
        }
        {
            const errMsgPart = options.initial ? " " : " not ";
            if (firstWindow.isVisible() !== options.initial) {
                throw new Error(`window should${errMsgPart}be visible`);
            }
            if (firstWindow.isFocused() !== options.initial) {
                throw new Error(`window should${errMsgPart}be focused`);
            }
        }
        {
            const {width, height} = firstWindow.getBounds();
            if (width < 0 || height < 0) {
                throw new Error(`Invalid bounds: ${JSON.stringify({width, height})}`);
            }
        }
        return options;
    }
} as const;

export const saveScreenshot = async (t: ExecutionContext<TestContext>): Promise<string | void> => {
    {
        const alive = (
            t.context.app.windows().length > 1
            &&
            await t.context.app.evaluate(({BrowserWindow}) => BrowserWindow.getFocusedWindow()?.webContents.isDestroyed() === false)
        );
        if (!alive) {
            return;
        }
    }
    const file = path.join(
        t.context.outputDirPath,
        `screenshot-${t.title}-${new Date().toISOString()}.png`.replace(/[^A-Za-z0-9.]/g, "_"),
    );
    await t.context.firstWindowPage.screenshot({path: file});
    console.info(`Screenshot saved to: ${file}`); // eslint-disable-line no-console
    return file;
};

export const accountCssSelector = (zeroStartedAccountIndex = 0): string => {
    return `.list-group.accounts-list > electron-mail-account-title:nth-child(${zeroStartedAccountIndex + 1})`;
};

export const accountBadgeCssSelector = (zeroStartedAccountIndex = 0): string => {
    return `${accountCssSelector(zeroStartedAccountIndex)} .badge`;
};
