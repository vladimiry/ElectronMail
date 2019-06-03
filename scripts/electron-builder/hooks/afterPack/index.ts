import path from "path";
import fs, {Stats} from "fs";
import {AfterPackContext, Configuration} from "app-builder-lib";
import {promisify} from "util";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR, PACKAGE_NAME} from "src/shared/constants";
import {LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {copyDictionaryFiles} from "scripts/electron-builder/lib";

const hook: Required<Configuration>["afterPack"] = async (context) => {
    const electronPlatformNameLoweredCase = context.electronPlatformName.toLowerCase();

    if (electronPlatformNameLoweredCase.startsWith("lin")) {
        await linux(context);
        return;
    }

    if (electronPlatformNameLoweredCase.startsWith("win")) {
        await windows(context);
    }
};

export default hook;

async function linux({targets, appOutDir}: AfterPackContext) {
    if (targets.length !== 1) {
        throw new Error(`Only one target is allowed at a time for Linux platform`);
    }

    const [target] = targets;
    const doNotSetSuidBitForTargetNames: Readonly<Array<typeof target.name>> = ["appimage", "snap"];
    const setSuidBitAndExit = !doNotSetSuidBitForTargetNames.includes(target.name.toLowerCase());

    if (setSuidBitAndExit) {
        const chromeSandboxBinaryFilePath = path.join(appOutDir, "chrome-sandbox");
        await execShell(["chmod", ["4755", chromeSandboxBinaryFilePath]]);
        return;
    }

    const appBinaryFileName = PACKAGE_NAME;
    const appBinaryFilePath = path.join(appOutDir, appBinaryFileName);
    const appBinaryStat = await promisify(fs.stat)(appBinaryFilePath);

    if (!appBinaryStat.isFile()) {
        throw new Error(`"${appBinaryFilePath}" is not a file`);
    }
    if (hasSuidBit(appBinaryStat)) {
        throw new Error(
            `"${appBinaryFilePath}" should not have SUID bit set for "${JSON.stringify(doNotSetSuidBitForTargetNames)}" targets`,
        );
    }

    const unixEOL = "\n";
    const renamedAppBinaryFileName = `${appBinaryFileName}.bin`;
    const renamedAppBinaryFilePath = path.join(path.dirname(appBinaryFilePath), renamedAppBinaryFileName);
    const appBinaryPreloadFileContent = [
        // WARN: shebang must be the first line
        `#!/bin/sh`,
        // "--disable-setuid-sandbox" prevents falling back to SUID sandbox
        `\${0%/*}/${renamedAppBinaryFileName} --no-sandbox --disable-setuid-sandbox $@`,
        // empty line at the end
        ``,
    ].join(unixEOL);

    await execShell(["mv", [appBinaryFilePath, renamedAppBinaryFilePath]]);

    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(appBinaryFilePath)} file with content:${unixEOL}`),
        LOG_LEVELS.value(appBinaryPreloadFileContent),
    );
    await promisify(fs.writeFile)(appBinaryFilePath, appBinaryPreloadFileContent);

    await execShell(["chmod", ["+x", appBinaryFilePath]]);

    function hasSuidBit({mode}: Stats): boolean {
        return Boolean(
            // tslint:disable-next-line:no-bitwise
            mode
            &
            // first bit of 12, same as 0b100000000000 binary or 2048 decimal
            0x800,
        );
    }
}

async function windows({appOutDir}: AfterPackContext) {
    await fillSpellcheckerDictionariesFolder({appOutDir});
}

async function fillSpellcheckerDictionariesFolder({appOutDir}: Pick<AfterPackContext, "appOutDir">) {
    await copyDictionaryFiles(path.join(appOutDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
}
