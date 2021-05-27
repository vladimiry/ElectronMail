import archiver from "archiver";
import fs from "fs";
import path from "path";
import {platform} from "os";

import {CONSOLE_LOG, catchTopLeventAsync, execShell} from "scripts/lib";
import {listInstallationPackageFiles} from "./lib";

const [, , DIST_DIRECTORY, OUTPUT_DIRECTORY] = process.argv as [null, null, string, string];

const archiveOutputFile = path.join(OUTPUT_DIRECTORY, `dist-${platform()}.tar`);
const archiveOutputStream = fs.createWriteStream(archiveOutputFile);
const archiverInstance = archiver("tar");

archiveOutputStream.on("finish", async () => {
    await execShell(["yarn", ["scripts/transfer", "upload", archiveOutputFile]]);
});

archiverInstance.pipe(archiveOutputStream);

catchTopLeventAsync(async () => {
    for (const file of await listInstallationPackageFiles(DIST_DIRECTORY)) {
        if (file.endsWith(".blockmap")) {
            continue;
        }

        CONSOLE_LOG(
            `Adding ${(fs.statSync(file).size / (1024 * 1024)).toFixed(2)} MB ${file} file to the ${archiveOutputFile} archive`,
        );

        archiverInstance.file(file, {name: path.basename(file)});
    }

    await archiverInstance.finalize();
});
