import path from "path";

import {CONSOLE_LOG, calculateHash, catchTopLeventAsync} from "scripts/lib";
import {listInstallationPackageFiles} from "./lib";

const [, , DIST_DIRECTORY] = process.argv as [null, null, string];

catchTopLeventAsync(async () => {
    const files = await listInstallationPackageFiles(DIST_DIRECTORY);

    CONSOLE_LOG(`Hashing ${String(files.length)} package's located in ${DIST_DIRECTORY} directory:`);

    for (const file of files) {
        const {hash, type} = await calculateHash(file);

        CONSOLE_LOG(`${path.basename(file)} [${type}]: ${hash}`);
    }
});
