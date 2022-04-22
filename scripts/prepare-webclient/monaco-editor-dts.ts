import dtsGeneratorImport, {DtsGeneratorOptions} from "dts-generator";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG} from "scripts/lib";
import {PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION} from "src/shared/const";
import {PROTON_SHARED_MESSAGE_INTERFACE} from "src/shared/const/proton-apps";

const dtsGenerator: { // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    default: (arg: NoExtraProps<StrictOmit<DtsGeneratorOptions, "name">>) => ReturnType<typeof dtsGeneratorImport>
} = dtsGeneratorImport as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const generateDtsForMonacoEditor = async (
    {sharedProtonPackageDir, destDir}: { sharedProtonPackageDir: string, destDir: string },
): Promise<void> => {
    const options = {
        system: {
            base: "./node_modules/typescript/lib",
            in: "./node_modules/typescript/lib/lib.esnext.d.ts",
            out: path.join(destDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION.system),
        },
        protonMessage: {
            base: sharedProtonPackageDir,
            in: path.join(sharedProtonPackageDir, PROTON_SHARED_MESSAGE_INTERFACE.projectRelativeFile),
            out: path.join(destDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION.protonMessage),
        },
    } as const;

    // TODO replace "dts-generator" dependency with something capable to combine "./node_modules/typescript/lib/lib.esnext.d.ts"
    for (const key of [/* "system", */ "protonMessage"] as const) {
        const {in: sourceFile, out: destFile, base: baseDir} = options[key];
        if (fsExtra.pathExistsSync(destFile)) {
            CONSOLE_LOG(`The "${destFile}" file already exists.`);
            continue;
        }
        if (!fsExtra.pathExistsSync(sourceFile)) {
            throw new Error(`The source "${sourceFile}" file doesn't exits.`);
        }
        await dtsGenerator.default({baseDir, files: [sourceFile], out: destFile});
        CONSOLE_LOG(`Merged "${sourceFile}" to "${destFile}"`);
    }

    // TODO drop custom "./node_modules/typescript/lib/lib.esnext.d.ts" combining when "dts-generator" gets replaced
    {
        const {in: sourceFile, out: destFile} = options.system;
        if (fsExtra.pathExistsSync(destFile)) {
            CONSOLE_LOG(`The "${destFile}" file already exists.`);
            return;
        }
        const referenceTagRe = /\/\/\/[\s\t]+<reference[\s\t]+lib=["']+(.*)["']+[\s\t]+\/>/;
        const mergedFiles = new Set<string>();
        const extractContent = (file: string): string => {
            if (mergedFiles.has(file)) {
                return "";
            }
            const lines = fs.readFileSync(file).toString().split("\n");
            const resultLines = [`// === file: ${file}`];
            for (const line of lines) {
                const match = referenceTagRe.exec(line);
                const libName = match && match[1];
                if (libName) {
                    resultLines.push(
                        extractContent(path.join(path.dirname(file), `lib.${libName}.d.ts`)),
                    );
                } else {
                    resultLines.push(line);
                }
            }
            mergedFiles.add(file);
            return resultLines.join("\n");
        };
        fsExtra.ensureDirSync(path.dirname(destFile));
        fs.writeFileSync(destFile, extractContent(sourceFile));
        CONSOLE_LOG(`Merged to "${destFile}" files:`, mergedFiles);
    }
};
