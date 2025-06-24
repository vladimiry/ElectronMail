import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG} from "scripts/lib";

const LIBS_TO_INCLUDE = [
    "es5",
    "es2015.core",
    "es2015.collection",
];

export const generateGlobalTypescriptEnvDeclaration = (libDir: string, destFile: string): void => {
    if (fsExtra.pathExistsSync(destFile)) {
        CONSOLE_LOG(`The "${destFile}" file already exists.`);
        return;
    }

    const visited = new Set<string>();
    const output: string[] = [];

    LIBS_TO_INCLUDE.forEach(addLibFile);

    fs.writeFileSync(destFile, output.join("\n\n"), "utf-8");

    CONSOLE_LOG(`"${destFile}" created`);

    function addLibFile(libName: string) {
        const fileName = path.join(libDir, `lib.${libName}.d.ts`);
        if (!fs.existsSync(fileName)) {
            console.warn(`Lib file not found: ${fileName}`);
            return;
        }
        if (visited.has(fileName)) return;
        visited.add(fileName);

        output.push(`// ---- ${path.basename(fileName)} ----\n${fs.readFileSync(fileName)}`);
    }
};
