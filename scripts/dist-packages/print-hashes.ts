import fs from "fs";
import path from "path";
import {createHash} from "crypto";

import {LOG, LOG_LEVELS} from "scripts/lib";
import {listInstallationPackageFiles} from "./lib";

const [, , DIST_DIRECTORY] = process.argv as [null, null, string];

const algorithms = ["sha1"];

// tslint:disable-next-line:no-floating-promises
(async () => {
    const files = await listInstallationPackageFiles(DIST_DIRECTORY);

    LOG(
        LOG_LEVELS.title(
            `Hashing ${LOG_LEVELS.value(String(files.length))} package's located in ${LOG_LEVELS.value(DIST_DIRECTORY)} directory:`,
        ),
    );

    for (const file of files) {
        for (const algorithm of algorithms) {
            const hash = await calculateHash(file, algorithm);

            LOG(
                LOG_LEVELS.title(
                    `${LOG_LEVELS.value(path.basename(file))} [${algorithm}]: ${LOG_LEVELS.value(hash)}`,
                ),
            );
        }
    }
})();

function calculateHash(file: string, alg: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash(alg);

        fs.createReadStream(file)
            .on("data", (data) => hash.update(data))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);
    });
}
