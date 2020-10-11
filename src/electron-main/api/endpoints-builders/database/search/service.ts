import {Folder, FsDbAccount, Mail, View} from "src/shared/model/database";
import {
    buildFoldersAndRootNodePrototypes,
    fillFoldersAndReturnRootConversationNodes,
    splitAndFormatAndFillSummaryFolders
} from "src/electron-main/api/endpoints-builders/database/folders-view";
import {walkConversationNodesTree} from "src/shared/util";

export function searchRootConversationNodes(
    account: DeepReadonly<FsDbAccount>,
    {mailPks, folderIds}: DeepReadonly<{ mailPks?: Array<Mail["pk"]>; folderIds?: Array<Folder["pk"]> }> = {},
): View.RootConversationNode[] {
    // TODO optimize search: implement custom search instead of getting all the mails first and then narrowing the list down
    // TODO don't create functions inside iterations so extensively, "filter" / "walkConversationNodesTree" calls
    const {rootNodePrototypes, folders} = buildFoldersAndRootNodePrototypes(account);
    const filteredByMails = mailPks
        ? rootNodePrototypes.filter((rootNodePrototype) => {
            let matched = false;
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

    const result = folderIds
        ? filteredByMailsWithFoldersAttached.filter((rootNodePrototype) => {
            let matched = false;
            walkConversationNodesTree([rootNodePrototype], ({mail}) => {
                matched = Boolean(mail && mail.folders.find(({id}) => folderIds.includes(id)));
                if (!matched) {
                    return;
                }
                return "break";
            });
            return matched;
        })
        : filteredByMailsWithFoldersAttached;

    // TODO use separate function to fill the system folders names
    splitAndFormatAndFillSummaryFolders(folders);

    return result;
}
