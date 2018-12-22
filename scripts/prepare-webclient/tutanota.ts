import {FolderAsDomainEntry, execAccountTypeFlow} from "./lib";
import {Unpacked} from "src/shared/types";
import {consoleLevels, consoleLog, execShell} from "scripts/lib";

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
    flow: async ({repoDir, folderAsDomainEntry}) => {
        await build({repoDir, ...folderAsDomainEntry});
    },
}).catch((error) => {
    consoleLog(consoleLevels.error(error));
    process.exit(1);
});

async function build({repoDir: cwd}: { repoDir: string; } & Unpacked<typeof folderAsDomainEntries>) {
    await execShell(["node", ["dist", "prod"], {cwd}]);
}
