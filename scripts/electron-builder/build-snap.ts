import path from "path";

import {addCommandLineArgs, build, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";
import {assertPathIsInCwd, catchTopLeventAsync, execShell} from "scripts/lib";
import {BINARY_NAME} from "src/shared/const";

async function unpack({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    await execShell(["unsquashfs", ["-dest", packageDir, "-processors", "1", packageFile]]);
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    await execShell(["rm", ["--force", packageFile]]);
    await execShell(["snapcraft", ["pack", packageDir, "--output", packageFile]]);
    assertPathIsInCwd(packageDir);
    await execShell(["npx", ["--no", "rimraf", packageDir]]);
}

async function postProcess({packageFile}: { packageFile: string }): Promise<void> {
    const packageDir = `${packageFile}-squashfs-root-${Date.now()}`;
    await unpack({packageDir, packageFile});
    // eslint-disable-next-line max-len
    const searchValue = `exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/${BINARY_NAME}" "$@" --no-sandbox`;
    addCommandLineArgs({
        shFile: path.join(packageDir, "./command.sh"),
        searchValue,
        replaceWith: searchValue,
    });
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

catchTopLeventAsync(async () => {
    await postProcess(
        await build("snap"),
    );
});
