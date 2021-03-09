import path from "path";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR} from "src/shared/constants";
import {CONSOLE_LOG, execShell} from "scripts/lib";
import {copyDictionaryFilesTo} from "scripts/electron-builder/lib";

const hookName = "afterPack";

const printPrefix = `[hook: ${hookName}]`;

async function linux({targets, appOutDir}: import("app-builder-lib").AfterPackContext): Promise<void> {
    if (targets.length !== 1) {
        throw new Error(`${printPrefix} Only one target is allowed at a time for Linux platform`);
    }

    const [target] = targets;

    if (!target) {
        throw new Error("Target resolving failed");
    }

    const {name: targetName} = target;

    if (!["appimage", "snap"].includes(targetName.toLocaleLowerCase())) {
        await execShell(["chmod", ["4755", path.join(appOutDir, "chrome-sandbox")]]);
    }
}

const hook: Required<import("app-builder-lib").Configuration>[typeof hookName] = async (context) => {
    const electronPlatformNameLoweredCase = context.electronPlatformName.toLowerCase();

    CONSOLE_LOG(`${printPrefix} Processing ${JSON.stringify(context.targets.map(({name}) => name))} targets`);

    if (electronPlatformNameLoweredCase.startsWith("lin")) {
        await linux(context);
        return;
    }

    if (electronPlatformNameLoweredCase.startsWith("win")) {
        await copyDictionaryFilesTo(path.join(context.appOutDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    }
};

export default hook;
