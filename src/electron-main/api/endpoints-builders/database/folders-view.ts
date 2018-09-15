import R from "ramda";

import * as View from "src/shared/model/database/view";
import sanitizeHtml from "sanitize-html";
import {ConversationEntry, Folder, FsDb, FsDbAccount, MAIL_FOLDER_TYPE} from "src/shared/model/database";
import {fromString} from "html-to-text";
import {walkConversationNodesTree} from "src/shared/util";

const splitAndFormatFolders: (folders: View.Folder[]) => {
    system: View.Folder[];
    custom: View.Folder[];
} = ((customizers: Record<keyof typeof MAIL_FOLDER_TYPE._.nameValueMap, {
    title: (f: View.Folder) => string;
    order: number;
}>) => {
    type Customizer = typeof customizers[keyof typeof MAIL_FOLDER_TYPE._.nameValueMap];
    type CustomizerResolver = (folder: View.Folder) => Customizer;

    const sortByName = R.sortBy(R.prop(((prop: keyof Pick<View.Folder, "name">) => prop)("name")));
    const customizerBasedComparator = (customizer: CustomizerResolver) => (o1: View.Folder, o2: View.Folder) => {
        return customizer(o1).order - customizer(o2).order;
    };

    return (folders: View.Folder[]) => {
        const customizer: CustomizerResolver = ((cache) => (folder: View.Folder): Customizer => cache.get(folder) as Customizer)(
            new Map(folders.map((folder) => [
                folder, customizers[MAIL_FOLDER_TYPE._.resolveNameByValue(folder.folderType)],
            ] as [View.Folder, Customizer])),
        );
        const result = {
            system: R.sort(customizerBasedComparator(customizer), folders.filter((f) => f.folderType !== MAIL_FOLDER_TYPE.CUSTOM)),
            custom: sortByName(folders.filter((f) => f.folderType === MAIL_FOLDER_TYPE.CUSTOM)),
        };

        result.system.forEach((folder) => folder.name = customizer(folder).title(folder));

        return result;
    };
})({
    CUSTOM: {
        title: ({name}) => name,
        order: 0,
    },
    INBOX: {
        title: () => "Inbox",
        order: 1,
    },
    SENT: {
        title: () => "Sent",
        order: 3,
    },
    TRASH: {
        title: () => "Trash",
        order: 4,
    },
    ARCHIVE: {
        title: () => "Archive",
        order: 5,
    },
    SPAM: {
        title: () => "Spam",
        order: 6,
    },
    DRAFT: {
        title: () => "Draft",
        order: 2,
    },
});

// TODO review the "buildFoldersView" function in order to reduce complexity and memory use
function buildFoldersView<T extends keyof FsDb>(
    _: Pick<FsDbAccount<T>, "conversationEntries" | "folders" | "mails">,
    // making sure input account is not mutated
    account = R.clone(_),
): View.Folder[] {
    const folders: View.Folder[] = Array.from(Object.values(account.folders), (folder) => ({...folder, rootConversationNodes: []}));
    const rootNodes: View.ConversationNode[] = [];
    const foldersMappedByMailFolderId = new Map(
        folders.reduce(
            (mapEntries: Array<[Folder["mailFolderId"], View.Folder]>, folder) => mapEntries.concat([[folder.mailFolderId, folder]]),
            [],
        ),
    );
    const nodeLookupMap = new Map<ConversationEntry["pk"], View.ConversationNode>();
    const nodeLookup = (
        pk: ConversationEntry["pk"] | Required<ConversationEntry>["previousPk"],
        node: View.ConversationNode = {children: []},
    ): View.ConversationNode => {
        node = nodeLookupMap.get(pk) || node;
        if (!nodeLookupMap.has(pk)) {
            nodeLookupMap.set(pk, node);
        }
        return node;
    };

    for (const entry of Object.values(account.conversationEntries)) {
        const node = nodeLookup(entry.pk);
        const resolvedMail = entry.mailPk && account.mails[entry.mailPk];
        const nodeMail: View.Mail | undefined = node.mail = resolvedMail
            ? {
                ...resolvedMail,
                // TODO test that "body" sanitazing is actually happening
                body: sanitizeHtml(resolvedMail.body),
                bodyExcerpt: fromString(resolvedMail.body),
                folders: [],
            }
            : undefined;

        if (nodeMail) {
            for (const mailFolderId of nodeMail.mailFolderIds) {
                const folder = foldersMappedByMailFolderId.get(mailFolderId);
                if (folder) {
                    nodeMail.folders.push(folder);
                }
            }
        }

        if (!entry.previousPk) {
            rootNodes.push(node);
            continue;
        }

        nodeLookup(entry.previousPk).children.push(node);
    }

    for (const rawRootNode of rootNodes) {
        const rootNode: View.RootConversationNode = {
            ...rawRootNode,
            summary: {
                size: 0,
                unread: 0,
                sentDateMin: 0,
                sentDateMax: 0,
            },
        };

        walkConversationNodesTree([rootNode], (node) => {
            node.children.sort((o1, o2) => {
                if (!o1.mail) {
                    return -1;
                }
                if (!o2.mail) {
                    return 1;
                }
                return o1.mail.sentDate - o2.mail.sentDate;
            });

            if (!node.mail) {
                return;
            }

            rootNode.summary.size++;
            rootNode.summary.unread += Number(node.mail.unread);
            rootNode.summary.sentDateMin = Math.min(node.mail.sentDate, rootNode.summary.sentDateMin);
            rootNode.summary.sentDateMax = Math.max(node.mail.sentDate, rootNode.summary.sentDateMax);

            node.mail.folders.forEach(({rootConversationNodes}) => {
                // TODO lookup from cache instead of calling "rootConversationNodes.includes" inside a loop
                rootConversationNodes.push(...(rootConversationNodes.includes(rootNode) ? [] : [rootNode]));
            });
        });
    }

    return folders;
}

// TODO consider moving performance expensive "prepareFoldersView" function call to the background thread (window.Worker)
// TODO make sure input "account" is not mutated
export function prepareFoldersView<T extends keyof FsDb>(
    account: Pick<FsDbAccount<T>, "conversationEntries" | "folders" | "mails">,
) {
    // TODO filter out unnecessary client-side properties from each entity (mail/folder/etc), such as "raw" property
    return splitAndFormatFolders(
        buildFoldersView(account),
    );
}
