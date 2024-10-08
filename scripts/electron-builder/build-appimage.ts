import path from "path";

import {addCommandLineArgs, build, DISABLE_SANDBOX_ARGS_LINE, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";
import {assertPathIsInCwd, catchTopLeventAsync, execShell, resolveExecutable} from "scripts/lib";
import {BINARY_NAME} from "src/shared/const";

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

async function resolveAppImageTool(): Promise<{command: string}> {
    const {command} = await resolveExecutable(
        "https://github.com/AppImage/AppImageKit/releases/download/13/appimagetool-x86_64.AppImage",
        "df3baf5ca5facbecfc2f3fa6713c29ab9cefa8fd8c1eac5d283b79cab33e4acb",
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
    await execShell([command, ["-n", "--comp", "xz", packageDir, packageFile], {env: {...process.env, ARCH: "x86_64"}}], {
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
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

catchTopLeventAsync(async () => {
    await postProcess(await build("appimage"));
});
