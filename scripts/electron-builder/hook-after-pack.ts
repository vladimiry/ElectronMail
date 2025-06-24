import type {AfterPackContext, Configuration, Target} from "app-builder-lib";
import path from "path";

import {CONSOLE_LOG, execShell} from "scripts/lib";

const hookName = "afterPack";

const printPrefix = `[hook: ${hookName}]`;

async function applyChmodThing({appOutDir}: AfterPackContext, {name: targetName}: Target): Promise<void> {
    if (!["appimage", "snap"].includes(targetName.toLocaleLowerCase())) {
        await execShell(["chmod", ["4755", path.join(appOutDir, "chrome-sandbox")]]);
    }
}

const hook: Required<Configuration>[typeof hookName] = async (ctx) => {
    if (ctx.targets.length !== 1) throw new Error(`${printPrefix} only one target is allowed at a time`);
    const [target] = ctx.targets;
    if (!target) throw new Error("Target resolving failed");

    CONSOLE_LOG(`${printPrefix} processing "${target.name}" target`);

    if (ctx.electronPlatformName.toLowerCase().startsWith("lin")) {
        await applyChmodThing(ctx, target);
    }
};

export default hook;
