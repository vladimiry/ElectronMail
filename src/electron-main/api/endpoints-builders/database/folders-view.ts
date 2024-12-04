import {omit} from "remeda";

import {buildAccountFoldersResolver} from "src/electron-main/database/util";
import {CONVERSATION_TYPE, ConversationEntry, FsDbAccount, SYSTEM_FOLDER_IDENTIFIERS, View} from "src/shared/model/database";
import {mailDateComparatorDefaultsToDesc, walkConversationNodesTree} from "src/shared/util";

type splitAndFormatAndFillSummaryFoldersType = (folders: View.Folder[]) => {system: View.Folder[]; custom: View.Folder[]};

// TODO move the "formatting" and "filling the summary" actions to individual functions
export const splitAndFormatAndFillSummaryFolders: splitAndFormatAndFillSummaryFoldersType = (() => {
    const resolveSystemFolderCustomizer = (() => {
        const customizers = { // just "order" value is set for now, later the icon/etc props might be added
            [SYSTEM_FOLDER_IDENTIFIERS["Virtual Unread"]]: {order: 0},
            [SYSTEM_FOLDER_IDENTIFIERS["Inbox"]]: {order: 1},
            [SYSTEM_FOLDER_IDENTIFIERS["Drafts"]]: {order: 2},
            [SYSTEM_FOLDER_IDENTIFIERS["Sent"]]: {order: 3},
            [SYSTEM_FOLDER_IDENTIFIERS["Starred"]]: {order: 4},
            [SYSTEM_FOLDER_IDENTIFIERS["Archive"]]: {order: 5},
            [SYSTEM_FOLDER_IDENTIFIERS["Spam"]]: {order: 6},
            [SYSTEM_FOLDER_IDENTIFIERS["Trash"]]: {order: 7},
            [SYSTEM_FOLDER_IDENTIFIERS["All Mail"]]: {order: 8},
        } as const;
        return ({id}: View.Folder) => customizers[id] ?? {order: -1};
    })();
    const result: splitAndFormatAndFillSummaryFoldersType = (folders) => {
        const systemFolderSortBy = (folder: View.Folder): number => resolveSystemFolderCustomizer(folder).order;
        const customFolderSortBy = (folder: View.Folder): string => String(folder.name);
        const bundle = {
            system: [...folders.filter(({id}) => SYSTEM_FOLDER_IDENTIFIERS._.isValidValue(id))]
                .sort((a, b) => systemFolderSortBy(a) - systemFolderSortBy(b)),
            custom: [...folders.filter(({id}) => !SYSTEM_FOLDER_IDENTIFIERS._.isValidValue(id))]
                .sort((a, b) => customFolderSortBy(a).localeCompare(customFolderSortBy(b))),
        } as const;

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
})();

function resolveAccountConversationNodes(account: DeepReadonly<FsDbAccount>): ConversationEntry[] {
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
        entriesMappedByPk.set(mailEntryPk, {...buildEntry({pk: mailEntryPk, mailPk: mail.pk}), previousPk: rootEntryPk});
    }

    return [...entriesMappedByPk.values()];
}

export function buildFoldersAndRootNodePrototypes(
    account: DeepReadonly<FsDbAccount>,
    includingSpam: boolean,
): {folders: View.Folder[]; rootNodePrototypes: View.ConversationNode[]} {
    const conversationEntries = resolveAccountConversationNodes(account);
    type nodeLookupType = (
        // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
        pk: ConversationEntry["pk"] | Required<ConversationEntry>["previousPk"],
        node?: View.ConversationNode,
    ) => View.ConversationNode;
    const nodeLookup: nodeLookupType = (() => {
        const nodeLookupMap = new Map<ConversationEntry["pk"], View.ConversationNode>();
        const result: nodeLookupType = (pk, node = {entryPk: pk, children: []}) => {
            node = nodeLookupMap.get(pk) || node;
            if (!nodeLookupMap.has(pk)) {
                nodeLookupMap.set(pk, node);
            }
            return node;
        };
        return result;
    })();
    const {folders, resolveFolderById, virtualUnreadFolderId} = buildAccountFoldersResolver(account, includingSpam);
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
                ? [...conversationNode.mail.mailFolderIds, virtualUnreadFolderId]
                : conversationNode.mail.mailFolderIds;

            for (const id of mailFolderIds) {
                const folder = resolveFolderById({id});
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

    return {folders, rootNodePrototypes};
}

export function fillFoldersAndReturnRootConversationNodes(rootNodePrototypes: View.ConversationNode[]): View.RootConversationNode[] {
    return rootNodePrototypes.map((rootNodePrototype) => {
        const rootNode: View.RootConversationNode = {...rootNodePrototype, summary: {size: 0, unread: 0, maxDate: 0}};
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

function buildFoldersView(account: DeepReadonly<FsDbAccount>, includingSpam: boolean): View.Folder[] {
    const {folders, rootNodePrototypes} = buildFoldersAndRootNodePrototypes(account, includingSpam);

    fillFoldersAndReturnRootConversationNodes(rootNodePrototypes);

    folders.forEach(({rootConversationNodes}) => {
        rootConversationNodes.sort((o1, o2) => o2.summary.maxDate - o1.summary.maxDate);
    });

    return folders;
}

// TODO consider moving performance expensive "prepareFoldersView" function call to the background process
export function prepareFoldersView(
    account: DeepReadonly<FsDbAccount>,
    includingSpam: boolean,
): ReturnType<typeof splitAndFormatAndFillSummaryFolders> {
    return splitAndFormatAndFillSummaryFolders(buildFoldersView(account, includingSpam));
}
