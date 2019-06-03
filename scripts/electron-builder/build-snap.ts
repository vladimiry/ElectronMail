import path from "path";
import {Packager, Platform} from "app-builder-lib";
import {getConfig} from "app-builder-lib/out/util/config";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR} from "src/shared/constants";
import {CWD, LOG, execShell} from "scripts/lib";
import {copyDictionaryFiles} from "scripts/electron-builder/lib";

(async () => {
    const packager = new Packager({
        targets: Platform.LINUX.createTarget("snap"),
        config: await getConfig(
            CWD,
            path.join(CWD, "./electron-builder.yml"),
            null,
        ),
    });
    const {artifactPaths: [snapFile]} = await packager.build();

    await postProcessSnapPackage(snapFile);
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function postProcessSnapPackage(snapFile?: string) {
    if (!snapFile || !snapFile.endsWith(".snap")) {
        throw new Error(`Invalid snap artifact: "${snapFile}"`);
    }

    const unSquashedSnapDir = `${snapFile}-squashfs-root-${Date.now()}`;

    await execShell(["unsquashfs", ["-dest", unSquashedSnapDir, "-processors", "1", snapFile]]);
    await copyDictionaryFiles(path.join(unSquashedSnapDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    await execShell(["rm", ["--force", snapFile]]);
    await execShell(["snapcraft", ["pack", unSquashedSnapDir, "--output", snapFile]]);
    await execShell(["npx", ["rimraf", unSquashedSnapDir]]);
}
