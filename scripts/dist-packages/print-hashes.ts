import fs from "fs";
import path from "path";
import {createHash} from "crypto";

import {CONSOLE_LOG} from "scripts/lib";
import {listInstallationPackageFiles} from "./lib";

const [, , DIST_DIRECTORY] = process.argv as [null, null, string];

const hashAlgorithm = "sha256";

async function calculateHash(file: string, alg: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash(alg);

        fs.createReadStream(file)
            .on("data", (data) => hash.update(data))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);
    });
}

(async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
    const files = await listInstallationPackageFiles(DIST_DIRECTORY);

    CONSOLE_LOG(`Hashing ${String(files.length)} package's located in ${DIST_DIRECTORY} directory:`);

    for (const file of files) {
        const hash = await calculateHash(file, hashAlgorithm);
        CONSOLE_LOG(`${path.basename(file)} [${hashAlgorithm}]: ${hash}`);
    }
})();
