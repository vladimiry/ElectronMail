import escapeStringRegexp from "escape-string-regexp";
import fs from "fs";
import mkdirp from "mkdirp";
import path from "path";
import {Packager, Platform} from "app-builder-lib";
import {getConfig} from "app-builder-lib/out/util/config";

import {BINARY_NAME} from "src/shared/constants";
import {CWD, LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {DISABLE_SANDBOX_ARGS_LINE, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

// TODO pass destination directory instead of hardcoding it ("--appimage-extract" doesn't support destination parameter at the moment)
const extractedImageFolderName = "squashfs-root";

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
    const {content: shContentPatched, count: shContentPatchedCount} = (() => {
        const searchValue = `exec "$BIN"`;
        const replaceWith = `${searchValue} ${DISABLE_SANDBOX_ARGS_LINE}`;
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

    LOG(
        LOG_LEVELS.title(`Writing ${LOG_LEVELS.value(shFile)} file with content:`),
        LOG_LEVELS.value(shContentPatched),
    );

    fs.writeFileSync(shFile, shContentPatched);
}

async function unpack({packageFile}: { packageFile: string; }): Promise<{ packageDir: string }> {
    const cwd = path.dirname(packageFile);
    const packageDir = path.join(
        path.dirname(packageFile),
        extractedImageFolderName,
    );

    await execShell(["npx", ["rimraf", packageDir]]);
    await execShell([packageFile, ["--appimage-extract"], {cwd}]);

    return {packageDir};
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string; }) {
    const {appImageTool} = await resolveAppImageTool({packageFile});

    await execShell(["rm", ["--force", packageFile]]);
    await execShell([appImageTool, ["-n", "--comp", "xz", packageDir, packageFile]]);
    await execShell(["npx", ["rimraf", packageDir]]);
}

async function resolveAppImageTool({packageFile}: { packageFile: string }): Promise<{ appImageTool: string }> {
    const appImageFile = path.join(
        path.join(path.dirname(packageFile), "./appimagetool"),
        "./appimagetool-x86_64.AppImage",
    );
    const cwd = path.dirname(appImageFile);

    mkdirp.sync(cwd);

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
