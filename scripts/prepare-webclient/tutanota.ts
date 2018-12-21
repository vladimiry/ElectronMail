import {FolderAsDomainEntry, consoleError, execAccountTypeFlow, execShell} from "./lib";
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
    flow: async ({repoDir, folderAsDomainEntry}) => {
        await build({repoDir, ...folderAsDomainEntry});
    },
}).catch(consoleError);

async function build({repoDir: cwd}: { repoDir: string; } & Unpacked<typeof folderAsDomainEntries>) {
    await execShell(["node", ["dist", "prod"], {cwd}]);
}
