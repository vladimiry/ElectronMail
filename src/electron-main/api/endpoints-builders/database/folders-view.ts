import R from "ramda";

import {CONVERSATION_TYPE, ConversationEntry, FsDb, FsDbAccount, MAIL_FOLDER_TYPE, View} from "src/shared/model/database";
import {mailDateComparatorDefaultsToDesc, walkConversationNodesTree} from "src/shared/util";
import {resolveAccountFolders} from "src/electron-main/database/util";

export const FOLDER_UTILS: {
    // TODO split "splitAndFormatAndFillSummaryFolders" function to pieces
    splitAndFormatAndFillSummaryFolders: (folders: View.Folder[]) => { system: View.Folder[]; custom: View.Folder[]; },
} = (() => {
    const customizers: Record<keyof typeof MAIL_FOLDER_TYPE._.nameValueMap, { title: (f: View.Folder) => string; order: number; }> = {
        CUSTOM: {
            title: ({name}) => name,
            order: 0,
        },
        INBOX: {
            title: () => "Inbox",
            order: 1,
        },
        DRAFT: {
            title: () => "Draft",
            order: 2,
        },
        SENT: {
            title: () => "Sent",
            order: 3,
        },
        STARRED: {
            title: () => "Starred",
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
        ALL: {
            title: () => "All Mail",
            order: 7,
        },
        TRASH: {
            title: () => "Trash",
            order: 8,
        },
    };

    type Customizer = typeof customizers[keyof typeof MAIL_FOLDER_TYPE._.nameValueMap];
    type CustomizerResolver = (folder: View.Folder) => Customizer;

    const sortByName = R.sortBy(
        R.prop(((prop: keyof Pick<View.Folder, "name">) => prop)("name")),
    );
    const buildCustomizerBasedComparator = (customizer: CustomizerResolver) => {
        return (o1: View.Folder, o2: View.Folder) => {
            return customizer(o1).order - customizer(o2).order;
        };
    };

    return {
        splitAndFormatAndFillSummaryFolders: (folders: View.Folder[]) => {
            const customizer: CustomizerResolver = ((map) => (folder: View.Folder): Customizer => map.get(folder) as Customizer)(
                new Map(folders.map((folder) => [
                    folder, customizers[MAIL_FOLDER_TYPE._.resolveNameByValue(folder.folderType)],
                ] as [View.Folder, Customizer])),
            );
            const bundle = {
                system: R.sort(
                    buildCustomizerBasedComparator(customizer),
                    folders.filter(({folderType}) => folderType !== MAIL_FOLDER_TYPE.CUSTOM),
                ),
                custom: sortByName(
                    folders.filter(({folderType}) => folderType === MAIL_FOLDER_TYPE.CUSTOM),
                ),
            } as const;

            bundle.system.forEach((folder) => folder.name = customizer(folder).title(folder));

            [...bundle.system, ...bundle.custom].forEach((folder) => {
                folder.size = 0;
                folder.unread = 0;

                walkConversationNodesTree(folder.rootConversationNodes, ({mail}) => {
                    if (!mail || !mail.folders.includes(folder)) {
                        return;
                    }

                    folder.size++;
                    folder.unread += Number(mail.unread);
                });
            });

            return bundle;
        },
    };
})();

function resolveAccountConversationNodes<T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>): ConversationEntry[] {
    if (account.metadata.type === "tutanota") {
        return Object.values(account.conversationEntries);
    }

    const buildEntry = ({pk, mailPk}: Pick<ConversationEntry, "pk" | "mailPk">) => ({
        pk,
        id: pk,
        raw: "{}",
        messageId: "",
        // TODO consider filling "conversationType" based on "mail.replyType"
        conversationType: CONVERSATION_TYPE.UNEXPECTED,
        mailPk,
    });
    const entriesMappedByPk = new Map<ConversationEntry["pk"], ConversationEntry>();

    for (const mail of Object.values(account.mails)) {
        const rootEntryPk = mail.conversationEntryPk;
        const mailEntryPk = `${rootEntryPk}:${mail.pk}`;

        entriesMappedByPk.set(
            rootEntryPk,
            // root entry is virtual one, so it doesn't have mail attached
            entriesMappedByPk.get(rootEntryPk) || buildEntry({pk: rootEntryPk}),
        );
        entriesMappedByPk.set(
            mailEntryPk,
            {
                ...buildEntry({pk: mailEntryPk, mailPk: mail.pk}),
                previousPk: rootEntryPk,
            },
        );
    }

    return [...entriesMappedByPk.values()];
}

export function buildFoldersAndRootNodePrototypes<T extends keyof FsDb["accounts"]>(
    account: FsDbAccount<T>,
): {
    folders: View.Folder[];
    rootNodePrototypes: View.ConversationNode[];
} {
    const conversationEntries = resolveAccountConversationNodes(account);
    const nodeLookup = (() => {
        const nodeLookupMap = new Map<ConversationEntry["pk"], View.ConversationNode>();
        return (
            pk: ConversationEntry["pk"] | Required<ConversationEntry>["previousPk"],
            node: View.ConversationNode = {entryPk: pk, children: []},
        ): View.ConversationNode => {
            node = nodeLookupMap.get(pk) || node;
            if (!nodeLookupMap.has(pk)) {
                nodeLookupMap.set(pk, node);
            }
            return node;
        };
    })();
    const folders: View.Folder[] = Array.from(
        resolveAccountFolders(account),
        (folder) => ({...folder, rootConversationNodes: [], size: 0, unread: 0}),
    );
    const resolveFolder = ((map = new Map(folders.reduce(
        (entries: Array<[View.Folder["mailFolderId"], View.Folder]>, folder) => entries.concat([[folder.mailFolderId, folder]]),
        [],
    ))) => ({mailFolderId}: Pick<View.Folder, "mailFolderId">) => map.get(mailFolderId))();
    const rootNodePrototypes: View.ConversationNode[] = [];

    for (const entry of conversationEntries) {
        const node = nodeLookup(entry.pk);
        const resolvedMail = entry.mailPk && account.mails[entry.mailPk];

        if (resolvedMail) {
            node.mail = {
                // TODO use "pick" instead of "omit", ie prefer whitelisting over blacklisting
                ...R.omit(["raw", "body", "attachments"], resolvedMail),
                folders: [],
            };

            for (const mailFolderId of node.mail.mailFolderIds) {
                const folder = resolveFolder({mailFolderId});
                if (folder) {
                    node.mail.folders.push(folder);
                }
            }
        }

        if (!entry.previousPk) {
            rootNodePrototypes.push(node);
            continue;
        }

        nodeLookup(entry.previousPk).children.push(node);
    }

    return {
        folders,
        rootNodePrototypes,
    };
}

export function fillFoldersAndReturnRootConversationNodes(rootNodePrototypes: View.ConversationNode[]): View.RootConversationNode[] {
    return rootNodePrototypes.map((rootNodePrototype) => {
        const rootNode: View.RootConversationNode = {
            ...rootNodePrototype,
            summary: {
                size: 0,
                unread: 0,
                maxDate: 0,
            },
        };
        const rootNodeFolders = new Set<View.Folder>();

        walkConversationNodesTree([rootNode], ({node}) => {
            node.children.sort((o1, o2) => {
                if (!o1.mail) {
                    return -1;
                }
                if (!o2.mail) {
                    return 1;
                }
                return mailDateComparatorDefaultsToDesc(o1.mail, o2.mail, "asc");
            });

            if (!node.mail) {
                return;
            }

            rootNode.summary.size++;
            rootNode.summary.unread += Number(node.mail.unread);
            rootNode.summary.maxDate = Math.max(node.mail.sentDate, rootNode.summary.maxDate);

            node.mail.folders.forEach((folder) => rootNodeFolders.add(folder));
        });

        for (const rootNodeFolder of rootNodeFolders) {
            rootNodeFolder.rootConversationNodes.push(rootNode);
        }

        return rootNode;
    });
}

function buildFoldersView<T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>): View.Folder[] {
    const {folders, rootNodePrototypes} = buildFoldersAndRootNodePrototypes(account);

    fillFoldersAndReturnRootConversationNodes(rootNodePrototypes);

    folders.forEach(({rootConversationNodes}) => {
        rootConversationNodes.sort((o1, o2) => o2.summary.maxDate - o1.summary.maxDate);
    });

    return folders;
}

// TODO consider moving performance expensive "prepareFoldersView" function call to the background process
export function prepareFoldersView<T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>) {
    return FOLDER_UTILS.splitAndFormatAndFillSummaryFolders(
        buildFoldersView(account),
    );
}
