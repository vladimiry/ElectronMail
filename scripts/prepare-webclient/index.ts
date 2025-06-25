import path from "path";
import pathIsInside from "path-is-inside";

import {buildProtonClients} from "./webclients";
import {catchTopLeventAsync} from "scripts/lib";
import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {generateGlobalTypescriptEnvDeclaration} from "./dts-global-ts-env";
import {generateProtonMessageDeclaration} from "./dts-proton-message";
import {LOCAL_WEBCLIENT_DIR_NAME, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION} from "src/shared/const";
import {PROTON_SHARED_MESSAGE_INTERFACE} from "src/shared/const/proton-apps";

const [, , appDestDir_] = process.argv;
if (!appDestDir_) {
    throw new Error("Empty base destination directory argument");
}
const appDestDir = path.resolve(CWD_ABSOLUTE_DIR, appDestDir_);

if (!pathIsInside(appDestDir, CWD_ABSOLUTE_DIR)) {
    throw new Error(`Invalid base destination directory argument value: ${appDestDir}`);
}

catchTopLeventAsync(async () => {
    // should be executed before d.ts generating as it clones the further referenced Proton project...
    await buildProtonClients({destDir: path.join(appDestDir, LOCAL_WEBCLIENT_DIR_NAME)});

    generateGlobalTypescriptEnvDeclaration(
        "./node_modules/typescript/lib",
        path.join(appDestDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION.system),
    );

    generateProtonMessageDeclaration(
        path.join("./output/git/WebClients/packages/shared", PROTON_SHARED_MESSAGE_INTERFACE.projectRelativeFile),
        path.join(appDestDir, PROTON_MONACO_EDITOR_DTS_ASSETS_LOCATION.protonMessage),
    );
});
