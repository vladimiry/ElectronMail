import electronLog from "electron-log";
import {equals, mergeDeepRight} from "ramda";

import {AccountType} from "src/shared/model/account";
import {Folder, FsDb, FsDbAccount} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/database/util]");

export const resolveAccountFolders: <T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>) => readonly Folder[] = (() => {
    const staticFolders: Readonly<Record<AccountType, readonly Folder[]>> = {
        tutanota: [],
    };

    const result: typeof resolveAccountFolders = (account) => [
        ...Object.values(account.folders),
        ...staticFolders[account.metadata.type],
    ];

    return result;
})();

// patching "target" with "source"
export function patchMetadata(
    target: FsDbAccount["metadata"],
    // TODO TS: use patch: Arguments<IpcMainApiEndpoints["dbPatch"]>[0]["metadata"],
    source: Skip<FsDbAccount<"tutanota">["metadata"], "type">,
    sourceType: "dbPatch" | "loadDatabase",
): boolean {
    const logPrefix = `patchMetadata() ${sourceType}`;

    logger.info(logPrefix);

    const merged = mergeDeepRight(target, source);

    // console.log(JSON.stringify({target, source, merged}, null, 2));

    if (equals(target, merged)) {
        return false;
    }

    Object.assign(target, merged);

    logger.verbose(logPrefix, `metadata patched with ${JSON.stringify(Object.keys(source))} properties`);

    return true;
}
