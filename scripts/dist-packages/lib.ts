import fastGlob from "fast-glob";
import fsExtra from "fs-extra";
import path from "path";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: PROJECT_NAME} = require("package.json");

export async function listInstallationPackageFiles(dir: string): Promise<string[]> {
    const result: string[] = [];

    if (!await fsExtra.pathExists(dir)) {
        return result;
    }

    return fastGlob(
        path
            .join(dir, `./${PROJECT_NAME}*.*`)
            .replace(/\\/g, "/"),
        {
            absolute: true,
            deep: 1,
            onlyFiles: true,
            stats: false,
        },
    );
}
