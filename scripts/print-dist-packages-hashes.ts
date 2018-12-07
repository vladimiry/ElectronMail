import fs from "fs";
import path from "path";
import {createHash} from "crypto";
import {promisify} from "util";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: APP_NAME} = require("package.json");

// tslint:disable-next-line:no-console
export const consoleLog = console.log;

const distDirectory = path.resolve(process.argv[2]);
const appNameRe = new RegExp(APP_NAME, "i");
const algorithms = ["sha1", "md5"];

// tslint:disable-next-line:no-floating-promises
(async () => {
    consoleLog(`Hashing installation packages in directory: ${distDirectory}`);

    const files = await listInstallationPackageFiles(distDirectory);

    consoleLog(`Resolved files to hash: ${files.length}`);

    for (const file of await listInstallationPackageFiles(distDirectory)) {
        for (const algorithm of algorithms) {
            const hash = await fileHash(file, algorithm);
            consoleLog(`${path.basename(file)} [${algorithm}]: ${hash}`);
        }
    }
})();

function fileHash(file: string, alg: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const hash = createHash(alg);
            fs.createReadStream(file)
                .on("data", (data) => hash.update(data))
                .on("end", () => resolve(hash.digest("hex")))
                .on("error", reject);
        } catch (error) {
            return reject(error);
        }
    });
}

async function listInstallationPackageFiles(dir: string): Promise<string[]> {
    const result: string[] = [];

    for (const name of await promisify(fs.readdir)(dir)) {
        // TODO make sure file is actually a file, not a directory
        if (appNameRe.exec(name)) {
            result.push(path.join(dir, name));
        }

    }
    return result;
}
