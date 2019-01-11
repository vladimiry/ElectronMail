import {FOLDER_UTILS, buildFoldersAndRootNodePrototypes, fillFoldersAndReturnRootConversationNodes} from "./folders-view";
import {Folder, FsDb, FsDbAccount, Mail, View} from "src/shared/model/database";
import {walkConversationNodesTree} from "src/shared/util";

export function search<T extends keyof FsDb["accounts"]>(
    account: FsDbAccount<T>,
    {mailPks, folderPks}: { mailPks?: Array<Mail["pk"]>; folderPks?: Array<Folder["pk"]>; } = {},
): View.RootConversationNode[] {
    // TODO optimize search: implement custom search instead of getting all the mails first and then narrowing the list down
    const {rootNodePrototypes, folders} = buildFoldersAndRootNodePrototypes(account);
    const filteredByMails = mailPks
        ? rootNodePrototypes.filter((rootNodePrototype) => {
            let matched: boolean = false;
            // don't filter by folders here as folders are not yet linked to root nodes at this point
            walkConversationNodesTree([rootNodePrototype], ({mail}) => {
                matched = Boolean(mail && mailPks.includes(mail.pk));
                if (!matched) {
                    return;
                }
                return "break";
            });
            return matched;
        })
        : rootNodePrototypes;
    const filteredByMailsWithFoldersAttached = fillFoldersAndReturnRootConversationNodes(filteredByMails);

    const result = folderPks
        ? filteredByMailsWithFoldersAttached.filter((rootNodePrototype) => {
            let matched: boolean = false;
            walkConversationNodesTree([rootNodePrototype], ({mail}) => {
                matched = Boolean(mail && mail.folders.find(({pk}) => folderPks.includes(pk)));
                if (!matched) {
                    return;
                }
                return "break";
            });
            return matched;
        })
        : filteredByMailsWithFoldersAttached;

    // TODO use separate function to fill the system folders names
    FOLDER_UTILS.splitAndFormatFolders(folders);

    return result;
}
