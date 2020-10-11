import electronLog from "electron-log";
import {equals} from "remeda";

import {Folder, FsDbAccount, LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/database/util]");

export const resolveAccountFolders: (
    account: DeepReadonly<FsDbAccount>,
) => readonly Folder[] = (
    (): typeof resolveAccountFolders => {
        const staticFolders: readonly Folder[] = (
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

        const result: typeof resolveAccountFolders = (account) => [
            ...Object.values(account.folders),
            ...staticFolders,
        ];

        return result;
    }
)();

// patching "target" with "source"
export function patchMetadata(
    target: FsDbAccount["metadata"],
    // TODO TS: use patch: Parameters<IpcMainApiEndpoints["dbPatch"]>[0]["metadata"],
    patch: DeepReadonly<FsDbAccount["metadata"]>,
    sourceType: "dbPatch" | "loadDatabase",
): boolean {
    const logPrefix = `patchMetadata() ${sourceType}`;

    logger.info(logPrefix);

    if (
        "latestEventId" in patch
        &&
        (
            !patch.latestEventId
            ||
            !patch.latestEventId.trim()
        )
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
