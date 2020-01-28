import path from "path";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR, BINARY_NAME} from "src/shared/constants";
import {LOG, execShell} from "scripts/lib";
import {build, copyDictionaryFilesTo, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

(async () => {
    await postProcess(
        await build("snap"),
    );
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function postProcess({packageFile}: { packageFile: string }) {
    const packageDir = `${packageFile}-squashfs-root-${Date.now()}`;

    await unpack({packageDir, packageFile});
    await copyDictionaryFilesTo(path.join(packageDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

async function unpack({packageFile, packageDir}: { packageFile: string; packageDir: string; }) {
    await execShell(["unsquashfs", ["-dest", packageDir, "-processors", "1", packageFile]]);
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string; }) {
    await execShell(["rm", ["--force", packageFile]]);
    await execShell(["snapcraft", ["pack", packageDir, "--output", packageFile]]);
    await execShell(["npx", ["rimraf", packageDir]]);
}
