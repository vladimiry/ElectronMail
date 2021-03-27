import electronLog from "electron-log";
import {equals} from "remeda";

import {Folder, FsDbAccount, LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS, View} from "src/shared/model/database";
import {PRODUCT_NAME} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/database/util]");

const resolveAccountFolders: (
    account: DeepReadonly<FsDbAccount>,
    includingSpam: boolean,
) => readonly Folder[] = (
    (): typeof resolveAccountFolders => {
        const staticFolders: ReadonlyArray<StrictOmit<Folder, "notify">> = (
            [
                SYSTEM_FOLDER_IDENTIFIERS.Inbox,
                SYSTEM_FOLDER_IDENTIFIERS.Drafts,
                SYSTEM_FOLDER_IDENTIFIERS.Sent,
                SYSTEM_FOLDER_IDENTIFIERS.Starred,
                SYSTEM_FOLDER_IDENTIFIERS.Archive,
                SYSTEM_FOLDER_IDENTIFIERS.Spam,
                SYSTEM_FOLDER_IDENTIFIERS.Trash,
                SYSTEM_FOLDER_IDENTIFIERS["All Mail"],
            ] as ReadonlyArray<Unpacked<typeof SYSTEM_FOLDER_IDENTIFIERS._.values>>
        ).map((id) => ({
            _validated: undefined,
            pk: id,
            id,
            raw: "{}",
            name: SYSTEM_FOLDER_IDENTIFIERS._.resolveNameByValue(id),
            type: LABEL_TYPE.MESSAGE_FOLDER,
        }));
        const disabledNotificationFolderIds: ReadonlyArray<Folder["id"]> = [
            SYSTEM_FOLDER_IDENTIFIERS.Trash,
            // this folder should not affect the combined "unread" state calculation
            // so "notify" should be set to 0/disabled since otherwise desktop notifications will always be displayed
            SYSTEM_FOLDER_IDENTIFIERS["All Mail"],
        ];
        return (account, includingSpam) => [
            ...Object.values(account.folders),
            ...staticFolders.map((item) => {
                return {
                    ...item,
                    notify: disabledNotificationFolderIds.includes(item.id)
                        ? 0
                        : includingSpam || item.id !== SYSTEM_FOLDER_IDENTIFIERS.Spam
                            ? 1
                            : 0,
                } as const;
            }),
        ];
    }
)();

const buildFolderViewPart = (): NoExtraProps<Pick<View.Folder, "rootConversationNodes" | "size" | "unread">> => {
    return {
        rootConversationNodes: [],
        size: 0,
        unread: 0,
    };
};

const buildVirtualUnreadFolder = (): Folder => {
    return {
        id: SYSTEM_FOLDER_IDENTIFIERS["Virtual Unread"],
        pk: `${PRODUCT_NAME}_VIRTUAL_UNREAD_PK`,
        raw: "{}",
        type: LABEL_TYPE.MESSAGE_FOLDER,
        name: "Unread",
        // this virtual folder should not affect the combined "unread" state calculation
        // so should be 0/disabled since otherwise desktop notifications will always be displayed
        notify: 0,
    };
};

// patching "target" with "source"
export function patchMetadata(
    target: FsDbAccount["metadata"],
    // TODO TS: use patch: Parameters<IpcMainApiEndpoints["dbPatch"]>[0]["metadata"],
    patch: DeepReadonly<FsDbAccount["metadata"]>,
    sourceType: "dbPatch" | "mergeAccount",
): boolean {
    const logPrefix = `patchMetadata() ${sourceType}`;

    logger.info(logPrefix);

    if (
        typeof patch.latestEventId !== "string"
        ||
        !patch.latestEventId.trim()
    ) {
        // we don't allow patching with empty/initial value
        // which would cause a need to completely reset the account in the database
        return false;
    }

    // TODO apply "merge deep" logic if metadata becomes nested object
    const merged = {...target, ...patch} as const;

    // console.log(JSON.stringify({target, source, merged}, null, 2));

    if (equals(target, merged)) {
        return false;
    }

    Object.assign(target, merged);

    logger.verbose(logPrefix, `metadata patched with ${JSON.stringify(Object.keys(patch))} properties`);

    return true;
}

export const buildAccountFoldersResolver = (
    account: DeepReadonly<FsDbAccount>,
    includingSpam: boolean,
): {
    folders: View.Folder[]
    virtualUnreadFolderId: Folder["id"]
    resolveFolderById: ({id}: Pick<View.Folder, "id">) => View.Folder | undefined
} => {
    const virtualUnreadFolder = buildVirtualUnreadFolder();
    const folders: View.Folder[] = Array.from(
        [
            virtualUnreadFolder,
            ...resolveAccountFolders(account, includingSpam),
        ],
        (folder) => ({...folder, ...buildFolderViewPart()}),
    );
    const foldersMap = new Map(
        folders.reduce(
            (entries: Array<[View.Folder["id"], View.Folder]>, folder) => entries.concat([[folder.id, folder]]),
            [],
        ),
    );
    return {
        folders,
        virtualUnreadFolderId: virtualUnreadFolder.id,
        resolveFolderById: ({id}) => foldersMap.get(id),
    };
};
