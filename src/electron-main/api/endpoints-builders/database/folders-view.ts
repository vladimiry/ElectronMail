import {omit, pipe, sort, sortBy} from "remeda";

import {CONVERSATION_TYPE, ConversationEntry, FsDbAccount, MAIL_FOLDER_TYPE, View} from "src/shared/model/database";
import {PRODUCT_NAME, VIRTUAL_UNREAD_FOLDER_TYPE} from "src/shared/constants";
import {mailDateComparatorDefaultsToDesc, walkConversationNodesTree} from "src/shared/util";
import {resolveAccountFolders} from "src/electron-main/database/util";

const buildFolderViewPart = (): NoExtraProperties<Pick<View.Folder, "rootConversationNodes" | "size" | "unread">> => {
    return {
        rootConversationNodes: [],
        size: 0,
        unread: 0,
    };
};

const buildVirtualUnreadFolder = (): View.Folder => {
    return {
        id: `${PRODUCT_NAME}_VIRTUAL_UNREAD_ID`,
        pk: `${PRODUCT_NAME}_VIRTUAL_UNREAD_PK`,
        raw: "{}",
        folderType: VIRTUAL_UNREAD_FOLDER_TYPE,
        name: "Unread",
        mailFolderId: `${PRODUCT_NAME}_VIRTUAL_UNREAD_MAIL_FOLDER_ID`,
        exclusive: -1,
        ...buildFolderViewPart(),
    };
};

// TODO split "splitAndFormatAndFillSummaryFolders" function to pieces
export const splitAndFormatAndFillSummaryFolders: (folders: View.Folder[]) => { system: View.Folder[]; custom: View.Folder[] } = (
    () => {
        const customizers: Record<keyof typeof MAIL_FOLDER_TYPE._.nameValueMap, { title: (f: View.Folder) => string; order: number }> = {
            _VIRTUAL_UNREAD_: {
                title: ({name}): string => name,
                order: 0,
            },
            CUSTOM: {
                title: ({name}): string => name,
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

        const sortByNameProp = sortBy(({name}: View.Folder) => name);

        const buildCustomizerBasedComparator = (customizer: CustomizerResolver) => {
            return (o1: View.Folder, o2: View.Folder): number => {
                return customizer(o1).order - customizer(o2).order;
            };
        };

        const result: typeof splitAndFormatAndFillSummaryFolders = (folders) => {
            const customizer: CustomizerResolver = ((map) => (folder: View.Folder): Customizer => map.get(folder) as Customizer)(
                new Map(folders.map((folder) => [
                    folder, customizers[MAIL_FOLDER_TYPE._.resolveNameByValue(folder.folderType)],
                ] as [View.Folder, Customizer])),
            );
            const bundle = {
                system: sort(
                    folders.filter(({folderType}) => folderType !== MAIL_FOLDER_TYPE.CUSTOM),
                    buildCustomizerBasedComparator(customizer),
                ),
                custom: pipe(
                    folders.filter(({folderType}) => folderType === MAIL_FOLDER_TYPE.CUSTOM),
                    sortByNameProp,
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
        };

        return result;
    }
)();

function resolveAccountConversationNodes(
    account: DeepReadonly<FsDbAccount>,
): ConversationEntry[] {
    const buildEntry = ({pk, mailPk}: Pick<ConversationEntry, "pk" | "mailPk">): ConversationEntry => ({
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

export function buildFoldersAndRootNodePrototypes(
    account: DeepReadonly<FsDbAccount>,
): {
    folders: View.Folder[];
    rootNodePrototypes: View.ConversationNode[];
} {
    const conversationEntries = resolveAccountConversationNodes(account);
    const nodeLookup: (
        pk: ConversationEntry["pk"] | Required<ConversationEntry>["previousPk"],
        node?: View.ConversationNode,
    ) => View.ConversationNode = (() => {
        const nodeLookupMap = new Map<ConversationEntry["pk"], View.ConversationNode>();
        const result: typeof nodeLookup = (pk, node = {entryPk: pk, children: []}) => {
            node = nodeLookupMap.get(pk) || node;
            if (!nodeLookupMap.has(pk)) {
                nodeLookupMap.set(pk, node);
            }
            return node;
        };
        return result;
    })();
    const virtualUnreadFolder = buildVirtualUnreadFolder();
    const folders: View.Folder[] = Array.from(
        [
            virtualUnreadFolder,
            ...resolveAccountFolders(account),
        ],
        (folder) => ({...folder, ...buildFolderViewPart()}),
    );
    const resolveFolder: ({mailFolderId}: Pick<View.Folder, "mailFolderId">) => View.Folder | undefined = (() => {
        const map = new Map(
            folders.reduce(
                (entries: Array<[View.Folder["mailFolderId"], View.Folder]>, folder) => {
                    return entries.concat([[folder.mailFolderId, folder]]);
                },
                [],
            ));
        const result: typeof resolveFolder = ({mailFolderId}) => map.get(mailFolderId);
        return result;
    })();
    const rootNodePrototypes: View.ConversationNode[] = [];

    for (const conversationEntry of conversationEntries) {
        const conversationNode = nodeLookup(conversationEntry.pk);
        const mail = conversationEntry.mailPk && account.mails[conversationEntry.mailPk];

        if (mail) {
            conversationNode.mail = {
                // TODO use "pick" instead of "omit", ie prefer whitelisting over blacklisting
                ...omit(mail, ["raw", "body", "attachments"]),
                attachmentsCount: mail.attachments.length,
                folders: [],
            };

            const mailFolderIds = conversationNode.mail.unread
                ? [...conversationNode.mail.mailFolderIds, virtualUnreadFolder.mailFolderId]
                : conversationNode.mail.mailFolderIds;

            for (const mailFolderId of mailFolderIds) {
                const folder = resolveFolder({mailFolderId});
                if (folder) {
                    conversationNode.mail.folders.push(folder);
                }
            }
        }

        if (!conversationEntry.previousPk) {
            rootNodePrototypes.push(conversationNode);
            continue;
        }

        nodeLookup(conversationEntry.previousPk).children.push(conversationNode);
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

function buildFoldersView(
    account: DeepReadonly<FsDbAccount>,
): View.Folder[] {
    const {folders, rootNodePrototypes} = buildFoldersAndRootNodePrototypes(account);

    fillFoldersAndReturnRootConversationNodes(rootNodePrototypes);

    folders.forEach(({rootConversationNodes}) => {
        rootConversationNodes.sort((o1, o2) => o2.summary.maxDate - o1.summary.maxDate);
    });

    return folders;
}

// TODO consider moving performance expensive "prepareFoldersView" function call to the background process
export function prepareFoldersView(
    account: DeepReadonly<FsDbAccount>,
): ReturnType<typeof splitAndFormatAndFillSummaryFolders> {
    return splitAndFormatAndFillSummaryFolders(
        buildFoldersView(account),
    );
}
