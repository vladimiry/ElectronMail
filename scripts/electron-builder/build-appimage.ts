import fs from "fs";
import path from "path";
import {Packager, Platform} from "app-builder-lib";
import {getConfig} from "app-builder-lib/out/util/config";

import {BINARY_NAME} from "src/shared/constants";
import {CWD, LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {DISABLE_SANDBOX_ARGS_LINE, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

(async () => {
    await postProcessSnapPackage(
        await build(),
    );
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function build(): Promise<{ packageFile: string }> {
    const packager = new Packager({
        targets: Platform.LINUX.createTarget("appimage"),
        config: await getConfig(
            CWD,
            path.join(CWD, "./electron-builder.yml"),
            null,
        ),
    });
    const {artifactPaths: [packageFile]} = await packager.build();

    if (!String(packageFile).endsWith(".AppImage")) {
        throw new Error(`Invalid artifact: "${packageFile}"`);
    }

    return {packageFile};
}

async function postProcessSnapPackage({packageFile}: { packageFile: string }) {
    const {packageDir} = await unpack({packageFile});
    disableSandbox({packageDir});
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

function disableSandbox({packageDir}: { packageDir: string; }): void {
    const shFile = path.join(packageDir, "./AppRun");
    const shContentOriginal = fs.readFileSync(shFile).toString();
    const shContentPatched = (() => {
        return shContentOriginal.replace(
            `BIN="$APPDIR/${BINARY_NAME}"`,
            `BIN="$APPDIR/${BINARY_NAME} ${DISABLE_SANDBOX_ARGS_LINE}"`,
        );
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

async function unpack({packageFile}: { packageFile: string; }): Promise<{ packageDir: string }> {
    const cwd = path.dirname(packageFile);
    // TODO pass destination directory instead of hardcoding it
    //      "dest" parameter is not yet support by "--appimage-extract" command
    const packageDir = path.join(
        path.dirname(packageFile),
        "./squashfs-root",
    );

    await execShell(["npx", ["rimraf", packageDir]]);
    await execShell([packageFile, ["--appimage-extract"], {cwd}]);

    return {packageDir};
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string; }) {
    const {appImageToolFile} = await resolveAppImageTool({packageFile});

    await execShell(["rm", ["--force", packageFile]]);
    await execShell([appImageToolFile, ["-n", "--comp", "xz", packageDir, packageFile]]);
    await execShell(["npx", ["rimraf", packageDir]]);
}

async function resolveAppImageTool({packageFile}: { packageFile: string }): Promise<{ appImageToolFile: string }> {
    const appImageToolFile = path.join(
        path.dirname(packageFile),
        "./appimagetool-x86_64.AppImage",
    );

    // TODO cache the "appimagetool"
    await execShell([
        "curl",
        [
            "--fail",
            "-L", // follow redirect
            "-o", appImageToolFile,
            `https://github.com/AppImage/AppImageKit/releases/download/continuous/${path.basename(appImageToolFile)}`,
        ],
    ]);

    await execShell(["chmod", ["+x", appImageToolFile]]);

    return {appImageToolFile};
}
