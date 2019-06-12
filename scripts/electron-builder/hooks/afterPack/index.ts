import fs from "fs";
import path from "path";
import {AfterPackContext, Configuration} from "app-builder-lib";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR, PACKAGE_NAME} from "src/shared/constants";
import {DISABLE_SANDBOX_ARGS_LINE, copyDictionaryFilesTo, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";
import {LOG, LOG_LEVELS, execShell} from "scripts/lib";

const printPrefix = `[hook: afterPack]`;

const hook: Required<Configuration>["afterPack"] = async (context) => {
    const electronPlatformNameLoweredCase = context.electronPlatformName.toLowerCase();

    LOG(
        LOG_LEVELS.title(
            `${printPrefix} Processing ${LOG_LEVELS.value(JSON.stringify(context.targets.map(({name}) => name)))} targets`,
        ),
    );

    if (electronPlatformNameLoweredCase.startsWith("lin")) {
        await linux(context);
        return;
    }

    if (electronPlatformNameLoweredCase.startsWith("win")) {
        await copyDictionaryFilesTo(path.join(context.appOutDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    }
};

export default hook;

async function linux({targets, appOutDir}: AfterPackContext) {
    if (targets.length !== 1) {
        throw new Error(`${printPrefix} Only one target is allowed at a time for Linux platform`);
    }

    const [{name: targetName}] = targets;

    if (!["appimage", "snap"].includes(targetName.toLowerCase())) {
        await execShell(["chmod", ["4755", path.join(appOutDir, "chrome-sandbox")]]);
    }

    if (targetName.toLowerCase() === "appimage") {
        await writeDisablingSandboxLoader({appOutDir});
    }
}

async function writeDisablingSandboxLoader(
    {appOutDir}: { appOutDir: string },
) {
    const appBinaryFileName = PACKAGE_NAME;
    const appBinaryFilePath = path.join(appOutDir, appBinaryFileName);

    ensureFileHasNoSuidBit(appBinaryFilePath);

    const unixEOL = "\n";
    const renamedAppBinaryFileName = `${appBinaryFileName}.bin`;
    const renamedAppBinaryFilePath = path.join(path.dirname(appBinaryFilePath), renamedAppBinaryFileName);
    const appBinaryPreloadFileContent = [
        `#!/bin/sh`, // shebang must be the first line
        `\${0%/*}/${renamedAppBinaryFileName} ${DISABLE_SANDBOX_ARGS_LINE} $@`,
        "", // empty line at the end
    ].join(unixEOL);

    await execShell(["mv", [appBinaryFilePath, renamedAppBinaryFilePath]]);

    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(appBinaryFilePath)} file with content:${unixEOL}`),
        LOG_LEVELS.value(appBinaryPreloadFileContent),
    );
    fs.writeFileSync(appBinaryFilePath, appBinaryPreloadFileContent);

    await execShell(["chmod", ["+x", appBinaryFilePath]]);
}
