import path from "path";
import {AfterPackContext, Configuration} from "app-builder-lib";

import {APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR, BINARY_NAME, PRODUCT_NAME} from "src/shared/constants";
import {LOG, LOG_LEVELS, execShell} from "scripts/lib";
import {copyDictionaryFilesTo} from "scripts/electron-builder/lib";

const printPrefix = `[hook: afterPack]`;

async function linux({targets, appOutDir}: AfterPackContext): Promise<void> {
    if (targets.length !== 1) {
        throw new Error(`${printPrefix} Only one target is allowed at a time for Linux platform`);
    }

    const [{name: targetName}] = targets;

    if (!["appimage", "snap"].includes(targetName.toLowerCase())) {
        await execShell(["chmod", ["4755", path.join(appOutDir, "chrome-sandbox")]]);
    }
}

const hook: Required<Configuration>["afterPack"] = async (context) => {
    const electronPlatformNameLoweredCase = context.electronPlatformName.toLowerCase();

    LOG(
        LOG_LEVELS.title(
            `${printPrefix} Processing ${LOG_LEVELS.value(JSON.stringify(context.targets.map(({name}) => name)))} targets`,
        ),
    );

    {
        // TODO electron v10 => v11: the asar file seems to be missing some dirs, like "./node_modules/sodium-native"
        //      this looks like an issue of one the following projects: electron, electron-builder, sodium-native
        //      the workaround is to repack the asar file:
        //      - unpacking takes missed stuff from the "app.asar.unpacked" dir
        //      - then packing puts everything to asar file
        const baseDir = path.join(
            context.appOutDir,
            electronPlatformNameLoweredCase.startsWith("darwin")
                ? `./${PRODUCT_NAME}.app/Contents/Resources`
                : "./resources",
        );
        const asarFile = path.join(baseDir, "./app.asar");
        const unpackedDir = path.join(baseDir, `./app.asar.unpacked.${BINARY_NAME}`);

        await execShell(["npx", ["--no-install", "asar", "extract", asarFile, unpackedDir]]);
        await execShell(["npx", ["--no-install", "rimraf", asarFile]]);
        await execShell(["npx", ["--no-install", "asar", "pack", unpackedDir, asarFile]]);
        await execShell(["npx", ["--no-install", "rimraf", unpackedDir]]);
    }

    if (electronPlatformNameLoweredCase.startsWith("lin")) {
        await linux(context);
        return;
    }

    if (electronPlatformNameLoweredCase.startsWith("win")) {
        await copyDictionaryFilesTo(path.join(context.appOutDir, APP_EXEC_PATH_RELATIVE_HUNSPELL_DIR));
    }
};

export default hook;
