import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG} from "scripts/lib";
import {IpcMainServiceScan} from "src/shared/api/main";
import {PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION} from "src/shared/constants";
import {PROTON_SHARED_MESSAGE_INTERFACE} from "src/shared/proton-apps-constants";

// TODO "require/var-requires"-based import
export const dtsGenerator: { // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    default: (options: { baseDir: string, files: string[], out: string }) => Promise<string>
} = require("dts-generator"); // eslint-disable-line @typescript-eslint/no-var-requires

export const resolveProtonMetadata = async (
    {destDir}: { destDir: string },
): Promise<IpcMainServiceScan["ApiImplReturns"]["staticInit"]["monacoEditorExtraLibArgs"]> => {
    const options = {
        system: {
            base: "./node_modules/typescript/lib",
            in: "./node_modules/typescript/lib/lib.esnext.d.ts",
            out: path.join(destDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION.system),
        },
        protonMessage: {
            base: "./output/git/proton-mail/node_modules/proton-shared",
            in: path.join("./output/git/proton-mail/node_modules/proton-shared", PROTON_SHARED_MESSAGE_INTERFACE.projectRelativeFile),
            out: path.join(destDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION.protonMessage),
        },
    } as const;

    // TODO replace "dts-generator" dependency with something capable to combine "./node_modules/typescript/lib/lib.esnext.d.ts"
    for (const key of [/* "system", */ "protonMessage"] as const) {
        const sourceFile = options[key].in;
        if (!fsExtra.pathExistsSync(sourceFile)) {
            throw new Error(`The source "${sourceFile}" file doesn't exits.`);
        }
        await dtsGenerator.default({baseDir: options[key].base, files: [sourceFile], out: options[key].out});
        CONSOLE_LOG(`Merged "${options[key].in}" to "${options[key].out}"`);
    }

    // TODO drop custom "./node_modules/typescript/lib/lib.esnext.d.ts" combining when "dts-generator" gets replaced
    {
        const referenceTagRe = /\/\/\/[\s\t]+<reference[\s\t]+lib=["']+(.*)["']+[\s\t]+\/>/;
        const mergedFiles: string[] = [];
        const extractContent = (file: string): string => {
            const lines = fs.readFileSync(file).toString().split("\n");
            const resultLines: string[] = [`// === file: ${file}`];
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
            mergedFiles.push(file);
            return resultLines.join("\n");
        };
        fsExtra.ensureDirSync(path.dirname(options.system.out));
        fs.writeFileSync(options.system.out, extractContent(options.system.in));
        CONSOLE_LOG(`Merged to "${options.system.out}" files:`, mergedFiles);
    }

    return {
        system: [
            fs.readFileSync(options.system.out).toString(),
            `in-memory:${options.system.in}`,
        ],
        protonMessage: [
            (
                fs.readFileSync(options.protonMessage.out).toString()
                +
                `declare const mail: Omit<import("lib/interfaces/mail/Message").Message, "Body"> & {Body: string};`
            ),
            `in-memory:${PROTON_SHARED_MESSAGE_INTERFACE.url}`,
        ],
    };
};
