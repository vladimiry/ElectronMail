import fastGlob from "fast-glob";
import fs from "fs";
import path from "path";

import {CONSOLE_LOG, execShell} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

// "--disable-setuid-sandbox" prevents falling back to SUID sandbox
export const DISABLE_SANDBOX_ARGS_LINE = "--no-sandbox";

export function ensureFileHasNoSuidBit(file: string): void {
    const stat = fs.statSync(file);

    if (!stat.isFile()) {
        throw new Error(`"${file}" is not a file`);
    }

    const hasSuidBit = Boolean(
        // tslint:disable-next-line:no-bitwise
        stat.mode
            // first bit of 12, same as 0b100000000000 binary or 2048 decimal
            & 0x800,
    );

    if (hasSuidBit) {
        throw new Error(`"${file}" should not have SUID bit set`);
    }
}

export async function build(packageType: "appimage" | "snap"): Promise<{packageFile: string}> {
    await execShell(["npm", [...`run electron-builder:shortcut -- --linux ${packageType}`.split(" ")]]);

    // TODO move "fastGlob" to lib function with inner "sanitizeFastGlobPattern" call
    const [packageFile] = await fastGlob(
        sanitizeFastGlobPattern(path.join(
            "./dist", // TODO resolve "./dist" programmatically from "electron-builder.yml"
            "*." + (packageType === "appimage" ? "AppImage" : packageType),
        )),
        {absolute: true, deep: 1, onlyFiles: true, stats: false},
    );

    if (!packageFile) {
        throw new Error(`Invalid artifact: "${String(packageFile)}"`);
    }

    return {packageFile};
}

export function addCommandLineArgs({shFile, searchValue, replaceWith}: {shFile: string; searchValue: string; replaceWith: string}): void {
    const shFileContent = (() => {
        const content = fs.readFileSync(shFile).toString();
        const patchedContent = content.replaceAll(searchValue, `${replaceWith} --js-flags="--max-old-space-size=12288"`);
        if (patchedContent === content) {
            throw new Error(`Failed to search the "${searchValue}" string in the "${shFile}" file`);
        }
        return patchedContent;
    })();
    CONSOLE_LOG(`Writing ${shFile} file with content:`, shFileContent);
    fs.writeFileSync(shFile, shFileContent);
}
