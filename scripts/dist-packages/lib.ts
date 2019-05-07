import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import {promisify} from "util";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: PROJECT_NAME} = require("package.json");

const appNameRe = new RegExp(PROJECT_NAME, "i");

export async function listInstallationPackageFiles(dir: string): Promise<string[]> {
    const result: string[] = [];

    if (!await fsExtra.pathExists(dir)) {
        return result;
    }

    for (const name of await promisify(fs.readdir)(dir)) {
        // TODO make sure "name" is actually a file, not a directory
        if (appNameRe.exec(name)) {
            result.push(path.resolve(dir, name));
        }
    }

    return result;
}
