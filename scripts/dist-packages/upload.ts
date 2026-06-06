import {catchTopLeventAsync, execShell} from "scripts/lib";
import {listInstallationPackageFiles} from "./lib";

const [, , DIST_DIRECTORY] = process.argv as [null, null, string];

catchTopLeventAsync(async () => {
    for (const file of await listInstallationPackageFiles(DIST_DIRECTORY)) {
        await execShell(["pnpm", ["run", "scripts/transfer", "upload", file]]);
    }
});
