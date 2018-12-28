import {DbAccountPk, FsDb, FsDbAccount, MemoryDb, MemoryDbAccount} from "src/shared/model/database";
import {PROTONMAIL_STATIC_FOLDERS} from "./constants";

export function resolveFsAccountFolders<T extends keyof FsDb["accounts"]>(account: FsDbAccount<T>) {
    return Object.values(account.folders).concat(
        resolveAccountVirtualFolders(account.metadata.type),
    );
}

export function resolveMemoryAccountFolders<T extends keyof MemoryDb["accounts"]>(account: MemoryDbAccount<T>) {
    return [...account.folders.values()].concat(
        resolveAccountVirtualFolders(account.metadata.type),
    );
}

function resolveAccountVirtualFolders<T extends DbAccountPk["type"]>(type: T) {
    return type === "protonmail"
        ? PROTONMAIL_STATIC_FOLDERS
        : [];
}
