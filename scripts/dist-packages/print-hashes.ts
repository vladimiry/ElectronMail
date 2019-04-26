import fs from "fs";
import path from "path";
import {createHash} from "crypto";

import {LOG} from "scripts/lib";
import {listInstallationPackageFiles} from "./lib";

const [, , DIST_DIRECTORY] = process.argv as [null, null, string];

const algorithms = ["sha1"];

// tslint:disable-next-line:no-floating-promises
(async () => {
    const files = await listInstallationPackageFiles(DIST_DIRECTORY);

    LOG(`Hashing ${files.length} installation package's located in directory: ${DIST_DIRECTORY}`);

    for (const file of files) {
        for (const algorithm of algorithms) {
            const hash = await calculateHash(file, algorithm);
            LOG(`${path.basename(file)} [${algorithm}]: ${hash}`);
        }
    }
})();

function calculateHash(file: string, alg: string): Promise<string> {
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
