import path from "path";
import fs, {Stats} from "fs";
import {Configuration, Platform} from "app-builder-lib";
import {promisify} from "util";

import {LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {PACKAGE_NAME} from "src/shared/constants";

const unixEOL = "\n";

// TODO use typed array on https://github.com/electron-userland/electron-builder/issues/3877 resolving
const disableSuidSandboxTargetNames: ReadonlySet<string> = new Set(["appimage", "snap"]);

// first bit of 12, same as 0b100000000000 binary or 2048 decimal
const suidBit = 0x800;

const hasSuidBit: (stat: Stats) => boolean = ({mode}) => {
    return Boolean(mode & suidBit); // tslint:disable-line:no-bitwise
};

const hook: Required<Configuration>["afterPack"] = async ({targets, appOutDir, electronPlatformName}) => {
    if (electronPlatformName !== Platform.LINUX.name) {
        return;
    }

    const disableSuidSandbox = targets.some(({name}) => disableSuidSandboxTargetNames.has(name.toLowerCase()));

    if (!disableSuidSandbox) {
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
            `"${appBinaryFilePath}" should not have SUID bit set for "${JSON.stringify(disableSuidSandboxTargetNames)}" targets`,
        );
    }

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
};

export default hook;
