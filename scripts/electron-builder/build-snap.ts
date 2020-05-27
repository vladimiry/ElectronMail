import fs from "fs";
import path from "path";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR, BINARY_NAME} from "src/shared/constants";
import {LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {build, copyDictionaryFilesTo, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

async function unpack({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    await execShell(["unsquashfs", ["-dest", packageDir, "-processors", "1", packageFile]]);
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    await execShell(["rm", ["--force", packageFile]]);
    await execShell(["snapcraft", ["pack", packageDir, "--output", packageFile]]);
    await execShell(["npx", ["rimraf", packageDir]]);
}

function addCommandLineArgs({packageDir}: { packageDir: string; }): void {
    const shFile = path.join(packageDir, "./command.sh");
    const shContentOriginal = fs.readFileSync(shFile).toString();
    const shContentPatched = (() => {
        const searchValue = `exec $SNAP/bin/desktop-launch "$SNAP/${BINARY_NAME}"`;
        const replaceWith = `${searchValue} --js-flags="--max-old-space-size=6144" $@`;
        return shContentOriginal.replace(searchValue, replaceWith);
    })();

    if (shContentPatched === shContentOriginal) {
        throw new Error(`Failed to patch content of the "${shFile}" file`);
    }

    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(shFile)} file with content:`),
        LOG_LEVELS.value(shContentPatched),
    );

    fs.writeFileSync(shFile, shContentPatched);
}

async function postProcess({packageFile}: { packageFile: string }): Promise<void> {
    const packageDir = `${packageFile}-squashfs-root-${Date.now()}`;

    await unpack({packageDir, packageFile});
    await copyDictionaryFilesTo(path.join(packageDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    addCommandLineArgs({packageDir});
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

(async () => {
    await postProcess(
        await build("snap"),
    );
})().catch((error) => {
    LOG(error);
    process.exit(1);
});
