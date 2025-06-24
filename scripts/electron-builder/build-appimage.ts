import path from "path";

import {addCommandLineArgs, build, DISABLE_SANDBOX_ARGS_LINE, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";
import {assertPathIsInCwd, catchTopLeventAsync, execShell, resolveExecutable} from "scripts/lib";
import {PRODUCT_NAME} from "src/shared/const";

// TODO pass destination directory instead of hardcoding it ("--appimage-extract" doesn't support destination parameter at the moment)
const extractedImageFolderName = "squashfs-root";

async function unpack({packageFile}: {packageFile: string}): Promise<{packageDir: string}> {
    const cwd = path.dirname(packageFile);
    const packageDir = path.join(path.dirname(packageFile), extractedImageFolderName);

    assertPathIsInCwd(packageDir);
    await execShell(["npx", ["--no", "rimraf", packageDir]]);
    await execShell([packageFile, ["--appimage-extract"], {cwd}]);

    return {packageDir};
}

// https://github.com/electron-userland/electron-builder-binaries/releases/download/appimage-12.0.1/appimage-12.0.1.7z

async function resolveAppImageTool(): Promise<{command: string}> {
    const {command} = await resolveExecutable(
        "https://github.com/AppImage/appimagetool/releases/download/1.9.0/appimagetool-x86_64.AppImage",
        "46fdd785094c7f6e545b61afcfb0f3d98d8eab243f644b4b17698c01d06083d1",
        "appimagetool",
    );
    const cwd = path.dirname(command);

    // unpacking the image in order to prevent the following error: AppImages require FUSE to run
    // https://docs.appimage.org/user-guide/run-appimages.html?highlight=fuse#the-appimage-tells-me-it-needs-fuse-to-run
    await execShell([command, ["--appimage-extract"], {cwd}]);

    return {command: path.join(cwd, path.join(extractedImageFolderName, "AppRun"))};
}

async function packAndCleanup({packageFile, packageDir}: {packageFile: string; packageDir: string}): Promise<void> {
    const {command} = await resolveAppImageTool();

    { // https://github.com/Ultimaker/Cura/issues/11918#issuecomment-1126669911
        await execShell(["chmod", ["0777", packageDir]]);
        await execShell(["chmod", ["0755", path.join(packageDir, "./AppRun")]]);
    }
    await execShell(["rm", ["--force", packageFile]]);
    await execShell([command, ["-n", "--comp", "zstd", packageDir, packageFile], {env: {...process.env, ARCH: "x86_64"}}], {
        printEnvWhitelist: ["ARCH"],
    });
    assertPathIsInCwd(packageDir);
    await execShell(["npx", ["--no", "rimraf", packageDir]]);
}

async function postProcess({packageFile}: {packageFile: string}): Promise<void> {
    const {packageDir} = await unpack({packageFile});
    const searchValue = `exec "$BIN"`;
    addCommandLineArgs({
        shFile: path.join(packageDir, "./AppRun"),
        searchValue,
        replaceWith: `${searchValue} ${DISABLE_SANDBOX_ARGS_LINE}`,
    });
    ensureFileHasNoSuidBit(path.join(packageDir, PRODUCT_NAME));
    await packAndCleanup({packageDir, packageFile});
}

catchTopLeventAsync(async () => {
    await postProcess(await build("appimage"));
});
