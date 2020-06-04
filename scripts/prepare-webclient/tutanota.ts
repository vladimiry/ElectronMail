import path from "path";

import {FolderAsDomainEntry, execAccountTypeFlow} from "./lib";
import {LOG, execShell} from "scripts/lib";

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
    flows: {
        async preInstall({repoDir}) {
            await execShell([
                "patch",
                [
                    path.join(repoDir, "src/misc/U2fClient.js"),
                    "./scripts/prepare-webclient/patches/src/misc/U2fClient.js.diff",
                ],
            ]);
        },
        async build({repoDir, folderAsDomainEntry}) {
            await build({repoDir, ...folderAsDomainEntry});
        },
    },
}).catch((error) => {
    LOG(error);
    process.exit(1);
});

async function build({repoDir: cwd}: { repoDir: string; } & Unpacked<typeof folderAsDomainEntries>) {
    await execShell(["node", ["dist", "prod"], {cwd}]);
}
