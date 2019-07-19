import fastGlob from "fast-glob";
import fsExtra from "fs-extra";
import path from "path";

import {sanitizeFastGlobPattern} from "src/shared/util";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: PROJECT_NAME} = require("package.json");

export async function listInstallationPackageFiles(dir: string): Promise<string[]> {
    const result: string[] = [];

    if (!await fsExtra.pathExists(dir)) {
        return result;
    }

    return fastGlob(
        sanitizeFastGlobPattern(
            path.join(dir, `./${PROJECT_NAME}*.*`),
        ),
        {
            absolute: true,
            deep: 1,
            onlyFiles: true,
            stats: false,
        },
    );
}
