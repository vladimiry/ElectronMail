import path from "path";
import pathIsInside from "path-is-inside";

import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {buildProtonClients} from "scripts/prepare-webclient/protonmail";
import {catchTopLeventAsync} from "scripts/lib";
import {resolveProtonMetadata} from "scripts/prepare-webclient/monaco-editor-dts";

const [, , appDestDir] = process.argv;

if (!appDestDir) {
    throw new Error("Empty base destination directory argument");
}

if (!pathIsInside(path.resolve(CWD_ABSOLUTE_DIR, appDestDir), CWD_ABSOLUTE_DIR)) {
    throw new Error(`Invalid base destination directory argument value: ${appDestDir}`);
}

catchTopLeventAsync(async () => {
    await buildProtonClients({destDir: path.join(appDestDir, "./webclient")});
    await resolveProtonMetadata({destDir: path.join(appDestDir)});
});
