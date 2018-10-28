import R from "ramda";

import {
    CONVERSATION_TYPE,
    ConversationEntry,
    Folder,
    FsDb,
    FsDbAccount,
    MAIL_FOLDER_TYPE,
    PROTONMAIL_MAILBOX_IDENTIFIERS,
    View,
} from "src/shared/model/database";
import {walkConversationNodesTree} from "src/shared/util";

const splitAndFormatFolders: (folders: View.Folder[]) => {
    system: View.Folder[];
    custom: View.Folder[];
} = ((customizers: Record<keyof typeof MAIL_FOLDER_TYPE._.nameValueMap, { title: (f: View.Folder) => string; order: number; }>) => {
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

const buildRootNodes = ((staticProtonmailFolders: Folder[]) => {
    return <T extends keyof FsDb["accounts"]>(
        account: FsDbAccount<T>,
    ): { rootNodes: View.ConversationNode[]; folders: View.Folder[]; } => {
        const conversationEntries: ConversationEntry[] = account.metadata.type === "tutanota"
            ? Object.values(account.conversationEntries)
            : ((
                buildEntry = ({pk, mailPk}: Pick<ConversationEntry, "pk" | "mailPk">) => ({
                    pk,
                    id: pk,
                    raw: "{}",
                    messageId: "",
                    // TODO consider filling "conversationType" based on "mail.replyType"
                    conversationType: CONVERSATION_TYPE.UNEXPECTED,
                    mailPk,
                }),
                entriesMappedByPk = new Map<ConversationEntry["pk"], ConversationEntry>(),
            ) => {
                for (const mail of Object.values(account.mails)) {
                    const rootEntryPk = mail.conversationEntryPk;
                    const mailEntryPk = `${rootEntryPk}:${mail.pk}`;
                    entriesMappedByPk.set(rootEntryPk, entriesMappedByPk.get(rootEntryPk) || buildEntry({pk: rootEntryPk}));
                    entriesMappedByPk.set(mailEntryPk, {
                        ...buildEntry({pk: mailEntryPk, mailPk: mail.pk}),
                        previousPk: rootEntryPk,
                    });
                }
                return [...entriesMappedByPk.values()];
            })();
        const nodeLookup = ((nodeLookupMap = new Map<ConversationEntry["pk"], View.ConversationNode>()) => (
            pk: ConversationEntry["pk"] | Required<ConversationEntry>["previousPk"],
            node: View.ConversationNode = {entryPk: pk, children: []},
        ): View.ConversationNode => {
            node = nodeLookupMap.get(pk) || node;
            if (!nodeLookupMap.has(pk)) {
                nodeLookupMap.set(pk, node);
            }
            return node;
        })();
        const folders: View.Folder[] = Array.from(
            account.metadata.type === "tutanota"
                ? Object.values(account.folders)
                : staticProtonmailFolders.concat(Object.values(account.folders)),
            (folder) => ({...folder, rootConversationNodes: []}),
        );
        const rootNodes: View.ConversationNode[] = [];
        const resolveFolder = ((map = new Map(folders.reduce(
            (entries: Array<[View.Folder["mailFolderId"], View.Folder]>, folder) => entries.concat([[folder.mailFolderId, folder]]),
            [],
        ))) => ({mailFolderId}: Pick<View.Folder, "mailFolderId">) => map.get(mailFolderId))();

        for (const entry of conversationEntries) {
            const node = nodeLookup(entry.pk);
            const resolvedMail = entry.mailPk && account.mails[entry.mailPk];

            node.mail = resolvedMail
                ? {
                    // TODO use "pick" instead of "omit", ie prefer whitelisting over blacklisting
                    ...R.omit(["raw", "body", "attachments"], resolvedMail),
                    folders: [],
                }
                : undefined;

            if (node.mail) {
                for (const mailFolderId of node.mail.mailFolderIds) {
                    const folder = resolveFolder({mailFolderId});
                    if (!folder) {
                        continue;
                    }
                    node.mail.folders.push(folder);
                }
            }

            if (!entry.previousPk) {
                rootNodes.push(node);
                continue;
            }

            nodeLookup(entry.previousPk).children.push(node);
        }

        return {
            rootNodes,
            folders,
        };
    };
})(([
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Inbox, MAIL_FOLDER_TYPE.INBOX],
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Drafts, MAIL_FOLDER_TYPE.DRAFT],
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Sent, MAIL_FOLDER_TYPE.SENT],
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Starred, MAIL_FOLDER_TYPE.CUSTOM],
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Archive, MAIL_FOLDER_TYPE.ARCHIVE],
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Spam, MAIL_FOLDER_TYPE.SPAM],
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Trash, MAIL_FOLDER_TYPE.TRASH],
    [PROTONMAIL_MAILBOX_IDENTIFIERS["All Mail"], MAIL_FOLDER_TYPE.CUSTOM],
] as Array<[Folder["id"], Folder["folderType"]]>).map(([id, folderType]) => ({
    pk: id,
    id,
    raw: "{}",
    folderType,
    name: PROTONMAIL_MAILBOX_IDENTIFIERS._.resolveNameByValue(id as any),
    mailFolderId: id,
})));

function fillRootNodesSummary(rootNodes: View.ConversationNode[]) {
    for (const rawRootNode of rootNodes) {
        const rootNode: View.RootConversationNode = {
            ...rawRootNode,
            summary: {
                size: 0,
                unread: 0,
                maxDate: 0,
            },
        };
        const rootNodeFolders = new Set<View.Folder>();

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
            rootNode.summary.maxDate = Math.max(node.mail.sentDate, rootNode.summary.maxDate);

            node.mail.folders.forEach((folder) => rootNodeFolders.add(folder));
        });

        for (const rootNodeFolder of rootNodeFolders) {
            rootNodeFolder.rootConversationNodes.push(rootNode);
        }
    }
}

function buildFoldersView<T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>): View.Folder[] {
    const {folders, rootNodes} = buildRootNodes(R.clone(account));

    fillRootNodesSummary(rootNodes);

    folders.forEach(({rootConversationNodes}) => {
        rootConversationNodes.sort((o1, o2) => o2.summary.maxDate - o1.summary.maxDate);
    });

    return folders;
}

// TODO consider moving performance expensive "prepareFoldersView" function call to the background thread (window.Worker)
// WARN make sure input "account" is not mutated
export function prepareFoldersView<T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>) {
    return splitAndFormatFolders(
        buildFoldersView(account),
    );
}
