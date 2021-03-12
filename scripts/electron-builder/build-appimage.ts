import escapeStringRegexp from "escape-string-regexp";
import fs from "fs";
import path from "path";

import {BINARY_NAME} from "src/shared/constants";
import {catchTopLeventAsync, CONSOLE_LOG, execShell, resolveExecutable} from "scripts/lib";
import {build, DISABLE_SANDBOX_ARGS_LINE, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

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

    await execShell(["npx", ["--no", "rimraf", packageDir]]);
    await execShell([packageFile, ["--appimage-extract"], {cwd}]);

    return {packageDir};
}

async function resolveAppImageTool(): Promise<{ command: string }> {
    const {command} = await resolveExecutable(
        "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage",
        "b6a088aa3d51949bb0578f218f8485f148389100e5c7f6d77a70c7f8e860f58b",
        "appimagetool",
        {optionalHashSumCheck: true},
    );
    const cwd = path.dirname(command);

    // unpacking the image in order to prevent the following error: AppImages require FUSE to run
    // https://docs.appimage.org/user-guide/run-appimages.html?highlight=fuse#the-appimage-tells-me-it-needs-fuse-to-run
    await execShell([command, ["--appimage-extract"], {cwd}]);

    return {
        command: path.join(
            cwd,
            path.join(extractedImageFolderName, "AppRun"),
        ),
    };
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string }): Promise<void> {
    const {command} = await resolveAppImageTool();

    await execShell(["rm", ["--force", packageFile]]);
    await execShell(
        [
            command,
            ["-n", "--comp", "xz", packageDir, packageFile],
            {env: {...process.env, ARCH: "x86_64"}},
        ],
        {printEnvWhitelist: ["ARCH"]},
    );
    await execShell(["npx", ["--no", "rimraf", packageDir]]);
}

async function postProcess({packageFile}: { packageFile: string }): Promise<void> {
    const {packageDir} = await unpack({packageFile});
    addCommandLineArgs({packageDir});
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

catchTopLeventAsync(async () => {
    await postProcess(
        await build("appimage"),
    );
});
