import path from "path";
import pathIsInside from "path-is-inside";

import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {buildProtonClients} from "./webclients";
import {catchTopLeventAsync} from "scripts/lib";
import {generateDtsForMonacoEditor} from "./monaco-editor-dts";

const [, , appDestDir] = process.argv;

if (!appDestDir) {
    throw new Error("Empty base destination directory argument");
}

if (!pathIsInside(path.resolve(CWD_ABSOLUTE_DIR, appDestDir), CWD_ABSOLUTE_DIR)) {
    throw new Error(`Invalid base destination directory argument value: ${appDestDir}`);
}

catchTopLeventAsync(async () => {
    await buildProtonClients({destDir: path.join(appDestDir, "./webclient")});
    await generateDtsForMonacoEditor({sharedProtonPackageDir: "./output/git/WebClients/packages/shared", destDir: appDestDir});
});
