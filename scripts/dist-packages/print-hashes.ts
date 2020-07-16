import fs from "fs";
import path from "path";
import {createHash} from "crypto";

import {LOG, LOG_LEVELS} from "scripts/lib";
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

(async () => {
    const files = await listInstallationPackageFiles(DIST_DIRECTORY);

    LOG(
        LOG_LEVELS.title(
            `Hashing ${LOG_LEVELS.value(String(files.length))} package's located in ${LOG_LEVELS.value(DIST_DIRECTORY)} directory:`,
        ),
    );

    for (const file of files) {
        const hash = await calculateHash(file, hashAlgorithm);

        LOG(
            LOG_LEVELS.title(
                `${LOG_LEVELS.value(path.basename(file))} [${hashAlgorithm}]: ${LOG_LEVELS.value(hash)}`,
            ),
        );
    }
})().catch((error) => {
    LOG(error);
    process.exit(1);
});
