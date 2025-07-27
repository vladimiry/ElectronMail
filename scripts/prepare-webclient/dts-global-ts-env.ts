import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG} from "scripts/lib";

const LIBS_TO_INCLUDE = [
    "es5",
    "es2015.core",
    "es2015.collection",
    "es2015.promise",
    "es2015.symbol",
    "es2016.array.include",
    "es2017.object",
    "es2018.promise",
    "es2019.object",
    "es2020",
];

export const generateGlobalTypescriptEnvDeclaration = (libDir: string, destFile: string): void => {
    if (fsExtra.pathExistsSync(destFile)) {
        CONSOLE_LOG(`The "${destFile}" file already exists.`);
        return;
    }

    const visited = new Set<string>();
    const output: string[] = [];

    CONSOLE_LOG(`creating "${destFile}"`);

    LIBS_TO_INCLUDE.forEach(addLibFile);

    fsExtra.ensureDirSync(path.dirname(destFile));
    fs.writeFileSync(destFile, output.join("\n\n"));

    CONSOLE_LOG(`"${destFile}" created`);

    function addLibFile(libName: string): void {
        const fileName = path.join(libDir, `lib.${libName}.d.ts`);

        CONSOLE_LOG(`adding "${fileName}" lib file`);

        if (!fs.existsSync(fileName)) throw new Error(`Lib file not found: ${fileName}`);
        if (visited.has(fileName)) return;
        visited.add(fileName);

        output.push(`// ---- ${path.basename(fileName)} ----\n${fs.readFileSync(fileName).toString()}`);
    }
};
