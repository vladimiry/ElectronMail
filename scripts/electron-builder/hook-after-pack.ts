import type {AfterPackContext, Configuration, Target} from "app-builder-lib";
import fastGlob from "fast-glob";
import path from "path";

import {CONSOLE_LOG, execShell} from "scripts/lib";

const hookName = "afterPack";

const printPrefix = `[hook: ${hookName}]`;

async function applyChmodThing({appOutDir}: AfterPackContext, {name: targetName}: Target): Promise<void> {
    if (!["appimage", "snap"].includes(targetName.toLocaleLowerCase())) {
        await execShell(["chmod", ["4755", path.join(appOutDir, "chrome-sandbox")]]);
    }
}

const resolveDistPrebuildsDirs = async (): Promise<string[]> => {
    return fastGlob("./dist/**/app.asar.unpacked/node_modules/**/prebuilds", {onlyDirectories: true});
};

const hook: Required<Configuration>[typeof hookName] = async (ctx) => {
    if (ctx.targets.length !== 1) throw new Error(`${printPrefix} only one target is allowed at a time`);
    const [target] = ctx.targets;
    if (!target) throw new Error("Target resolving failed");

    CONSOLE_LOG(`${printPrefix} processing "${target.name}" target`);

    if (ctx.electronPlatformName.toLowerCase().startsWith("lin")) {
        await applyChmodThing(ctx, target);
    }

    {
        let prebuildDirs = await resolveDistPrebuildsDirs();

        for (const prebuildDir of await resolveDistPrebuildsDirs()) {
            CONSOLE_LOG(`${printPrefix} removing "${prebuildDir}" directory`);
            await execShell(["npx", ["rimraf", prebuildDir]]);
        }

        if ((prebuildDirs = await resolveDistPrebuildsDirs()).length) {
            throw new Error(`Failed to remove the following dirs: ${JSON.stringify(prebuildDirs, null, 2)}`);
        }
    }
};

export default hook;
