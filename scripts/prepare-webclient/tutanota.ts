import chalk from "chalk";
import fsExtra from "fs-extra";

import {FolderAsDomainEntry, consoleError, consoleLog, execAccountTypeFlow, execShell} from "./lib";
import {Unpacked} from "src/shared/types";

const folderAsDomainEntries: Array<FolderAsDomainEntry<{}>> = [
    {
        folderNameAsDomain: "mail.tutanota.com",
        options: {},
    },
];

execAccountTypeFlow({
    accountType: "tutanota",
    folderAsDomainEntries,
    repoRelativeDistDir: "./build/dist",
    flow: async ({repoDir, repoDistDir, folderAsDomainEntry}) => {
        if (await fsExtra.pathExists(repoDistDir)) {
            consoleLog(chalk.yellow(`Skipping building`));
            return;
        }

        await build({repoDir, ...folderAsDomainEntry});
    },
}).catch(consoleError);

async function build({repoDir}: { repoDir: string; } & Unpacked<typeof folderAsDomainEntries>) {
    await execShell(["node", ["dist", "prod"], {cwd: repoDir}]);
}
