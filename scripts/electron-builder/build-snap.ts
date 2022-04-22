import fs from "fs";
import path from "path";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR} from "src/shared/const/hunspell";
import {assertPathIsInCwd, catchTopLeventAsync, CONSOLE_LOG, execShell} from "scripts/lib";
import {BINARY_NAME} from "src/shared/const";
import {build, copyDictionaryFilesTo, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

async function unpack({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    await execShell(["unsquashfs", ["-dest", packageDir, "-processors", "1", packageFile]]);
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    await execShell(["rm", ["--force", packageFile]]);
    await execShell(["snapcraft", ["pack", packageDir, "--output", packageFile]]);
    assertPathIsInCwd(packageDir);
    await execShell(["npx", ["--no", "rimraf", packageDir]]);
}

function addCommandLineArgs({packageDir}: { packageDir: string; }): void {
    const shFile = path.join(packageDir, "./command.sh");
    const shContentOriginal = fs.readFileSync(shFile).toString();
    const shContentPatched = (() => {
        // eslint-disable-next-line max-len
        const searchValue = `exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/${BINARY_NAME}" "$@" --no-sandbox`;
        const replaceWith = `${searchValue} --js-flags="--max-old-space-size=6144"`;
        return shContentOriginal.replace(searchValue, replaceWith);
    })();

    if (shContentPatched === shContentOriginal) {
        throw new Error(`Failed to patch content of the "${shFile}" file`);
    }

    CONSOLE_LOG(`Writing ${shFile} file with content:`, shContentPatched);

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

catchTopLeventAsync(async () => {
    await postProcess(
        await build("snap"),
    );
});
