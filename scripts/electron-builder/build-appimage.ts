import escapeStringRegexp from "escape-string-regexp";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {BINARY_NAME} from "src/shared/constants";
import {CONSOLE_LOG, execShell} from "scripts/lib";
import {DISABLE_SANDBOX_ARGS_LINE, build, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

// TODO pass destination directory instead of hardcoding it ("--appimage-extract" doesn't support destination parameter at the moment)
const extractedImageFolderName = "squashfs-root";

function addCommandLineArgs({packageDir}: { packageDir: string }): void {
    const shFile = path.join(packageDir, "./AppRun");
    const shContentOriginal = fs.readFileSync(shFile).toString();
    const {content: shContentPatched, count: shContentPatchedCount} = (() => {
        const searchValue = `exec "$BIN"`;
        const replaceWith = `${searchValue} ${DISABLE_SANDBOX_ARGS_LINE} --js-flags="--max-old-space-size=6144"`;
        let count = 0;
        const content = shContentOriginal.replace(
            new RegExp(escapeStringRegexp(searchValue), "g"),
            () => (count++, replaceWith),
        );
        return {count, content};
    })();

    if (shContentPatched === shContentOriginal || shContentPatchedCount !== 2) {
        throw new Error(`Failed to patch content of the "${shFile}" file`);
    }

    CONSOLE_LOG(`Writing ${shFile} file with content:`, shContentPatched);

    fs.writeFileSync(shFile, shContentPatched);
}

async function unpack({packageFile}: { packageFile: string }): Promise<{ packageDir: string }> {
    const cwd = path.dirname(packageFile);
    const packageDir = path.join(
        path.dirname(packageFile),
        extractedImageFolderName,
    );

    await execShell(["npx", ["--no-install", "rimraf", packageDir]]);
    await execShell([packageFile, ["--appimage-extract"], {cwd}]);

    return {packageDir};
}

async function resolveAppImageTool({packageFile}: { packageFile: string }): Promise<{ appImageTool: string }> {
    const appImageFile = path.join(
        path.join(path.dirname(packageFile), "./appimagetool"),
        "./appimagetool-x86_64.AppImage",
    );
    const cwd = path.dirname(appImageFile);

    fsExtra.ensureDirSync(cwd);

    // TODO cache the "appimagetool"
    await execShell([
        "curl",
        [
            "--fail",
            "--location",
            "--output", appImageFile,
            `https://github.com/AppImage/AppImageKit/releases/download/continuous/${path.basename(appImageFile)}`,
        ],
    ]);

    await execShell(["chmod", ["+x", appImageFile]]);

    // unpacking the image in order to prevent the following error: AppImages require FUSE to run
    // https://docs.appimage.org/user-guide/run-appimages.html?highlight=fuse#the-appimage-tells-me-it-needs-fuse-to-run
    await execShell([appImageFile, ["--appimage-extract"], {cwd}]);

    return {
        appImageTool: path.join(
            path.dirname(appImageFile),
            path.join(extractedImageFolderName, "AppRun"),
        ),
    };
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    const {appImageTool} = await resolveAppImageTool({packageFile});

    await execShell(["rm", ["--force", packageFile]]);
    await execShell([appImageTool, ["-n", "--comp", "xz", packageDir, packageFile]]);
    await execShell(["npx", ["--no-install", "rimraf", packageDir]]);
}

async function postProcess({packageFile}: { packageFile: string }): Promise<void> {
    const {packageDir} = await unpack({packageFile});
    addCommandLineArgs({packageDir});
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

(async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
    await postProcess(
        await build("appimage"),
    );
})();
