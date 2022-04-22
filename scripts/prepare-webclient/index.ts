import path from "path";
import pathIsInside from "path-is-inside";

import {buildProtonClients} from "./webclients";
import {catchTopLeventAsync} from "scripts/lib";
import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {generateDtsForMonacoEditor} from "./monaco-editor-dts";
import {LOCAL_WEBCLIENT_DIR_NAME} from "src/shared/const";

const [, , appDestDir_] = process.argv;
if (!appDestDir_) {
    throw new Error("Empty base destination directory argument");
}
const appDestDir = path.resolve(CWD_ABSOLUTE_DIR, appDestDir_);

if (!pathIsInside(appDestDir, CWD_ABSOLUTE_DIR)) {
    throw new Error(`Invalid base destination directory argument value: ${appDestDir}`);
}

catchTopLeventAsync(async () => {
    await buildProtonClients({destDir: path.join(appDestDir, LOCAL_WEBCLIENT_DIR_NAME)});
    await generateDtsForMonacoEditor({sharedProtonPackageDir: "./output/git/WebClients/packages/shared", destDir: appDestDir});
});
