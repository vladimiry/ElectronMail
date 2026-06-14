import type {AfterPackContext, Configuration, Target} from "app-builder-lib";
import path from "path";

import {CONSOLE_LOG, execShell} from "scripts/lib";

declare const BUILD_HOOK_NAME: Extract<keyof Configuration, "afterPack">;
declare const BUILD_HOOK_HOOK_PRINT_PREFIX: string;

const handleChromeSandboxFile = async ({appOutDir}: AfterPackContext, target: Target): Promise<void> => {
    const targetNameLowerCased = target.name.toLocaleLowerCase();
    const chromeSandboxFilePath = path.join(appOutDir, "chrome-sandbox");
    if (targetNameLowerCased.startsWith("snap")) {
        await execShell(["npx", ["--no", "rimraf", chromeSandboxFilePath]]);
    } else if (!targetNameLowerCased.includes("appimage")) {
        await execShell(["chmod", ["4755", chromeSandboxFilePath]]);
    }
};

const hook: Required<Configuration>[typeof BUILD_HOOK_NAME] = async (ctx) => {
    if (ctx.targets.length !== 1) throw new Error(`${BUILD_HOOK_HOOK_PRINT_PREFIX} only one target is allowed at a time`);
    const [target] = ctx.targets;
    if (!target) throw new Error("Target resolving failed");
    CONSOLE_LOG(`${BUILD_HOOK_HOOK_PRINT_PREFIX} processing "${target.name}" target`);
    if (ctx.electronPlatformName.toLowerCase().startsWith("lin")) {
        await handleChromeSandboxFile(ctx, target);
    }
};

export default hook;
