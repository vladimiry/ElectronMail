import fastGlob from "fast-glob";
import fsExtra from "fs-extra";
import path from "path";

import {PACKAGE_NAME} from "src/shared/constants";
import {sanitizeFastGlobPattern} from "src/shared/util";

export async function listInstallationPackageFiles(dir: string): Promise<string[]> {
    const result: string[] = [];

    if (!await fsExtra.pathExists(dir)) {
        return result;
    }

    return fastGlob(
        sanitizeFastGlobPattern(
            path.join(dir, `./${PACKAGE_NAME}*.*`),
        ),
        {
            absolute: true,
            deep: 1,
            onlyFiles: true,
            stats: false,
        },
    );
}
