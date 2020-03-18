import electronLog from "electron-log";
import {equals} from "remeda";

import {Folder, FsDbAccount, MAIL_FOLDER_TYPE, PROTONMAIL_MAILBOX_IDENTIFIERS} from "src/shared/model/database";
import {ReadonlyDeep} from "type-fest";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/database/util]");

export const resolveAccountFolders: (
    account: ReadonlyDeep<FsDbAccount>,
) => readonly Folder[] = (
    (): typeof resolveAccountFolders => {
        const staticFolders: readonly Folder[] = (
            [
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Inbox, MAIL_FOLDER_TYPE.INBOX],
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Drafts, MAIL_FOLDER_TYPE.DRAFT],
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Sent, MAIL_FOLDER_TYPE.SENT],
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Starred, MAIL_FOLDER_TYPE.STARRED],
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Archive, MAIL_FOLDER_TYPE.ARCHIVE],
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Spam, MAIL_FOLDER_TYPE.SPAM],
                [PROTONMAIL_MAILBOX_IDENTIFIERS.Trash, MAIL_FOLDER_TYPE.TRASH],
                [PROTONMAIL_MAILBOX_IDENTIFIERS["All Mail"], MAIL_FOLDER_TYPE.ALL],
            ] as Array<[Folder["id"], Folder["folderType"]]>
        ).map(([id, folderType]) => ({
            _validated: undefined,
            pk: id,
            id,
            raw: "{}",
            folderType,
            name: PROTONMAIL_MAILBOX_IDENTIFIERS._.resolveNameByValue(
                id as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            ),
            mailFolderId: id,
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
    patch: ReadonlyDeep<FsDbAccount["metadata"]>,
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
