import fs from "fs";
import path from "path";
import {Packager, Platform} from "app-builder-lib";
import {getConfig} from "app-builder-lib/out/util/config";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR, BINARY_NAME} from "src/shared/constants";
import {CWD, LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {DISABLE_SANDBOX_ARGS_LINE, copyDictionaryFiles, ensureFileHasNoSuidBit} from "scripts/electron-builder/lib";

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
        targets: Platform.LINUX.createTarget("snap"),
        config: await getConfig(
            CWD,
            path.join(CWD, "./electron-builder.yml"),
            null,
        ),
    });
    const {artifactPaths: [packageFile]} = await packager.build();

    if (!String(packageFile).endsWith(".snap")) {
        throw new Error(`Invalid artifact: "${packageFile}"`);
    }

    return {packageFile};
}

async function postProcessSnapPackage({packageFile}: { packageFile: string }) {
    const packageDir = `${packageFile}-squashfs-root-${Date.now()}`;

    await unpack({packageDir, packageFile});
    await copyDictionaryFiles(path.join(packageDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    disableSandbox({packageDir});
    ensureFileHasNoSuidBit(path.join(packageDir, BINARY_NAME));
    await packAndCleanup({packageDir, packageFile});
}

function disableSandbox({packageDir}: { packageDir: string; }): void {
    const shFile = path.join(packageDir, "./command.sh");
    const shContentOriginal = fs.readFileSync(shFile).toString();
    const shContentPatched = (() => {
        const searchValue = `exec $SNAP/bin/desktop-launch "$SNAP/${BINARY_NAME}"`;
        const replaceWith = `${searchValue} ${DISABLE_SANDBOX_ARGS_LINE}`;
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

async function unpack({packageFile, packageDir}: { packageFile: string; packageDir: string; }) {
    await execShell(["unsquashfs", ["-dest", packageDir, "-processors", "1", packageFile]]);
}

async function packAndCleanup({packageFile, packageDir}: { packageFile: string; packageDir: string; }) {
    await execShell(["rm", ["--force", packageFile]]);
    await execShell(["snapcraft", ["pack", packageDir, "--output", packageFile]]);
    await execShell(["npx", ["rimraf", packageDir]]);
}
