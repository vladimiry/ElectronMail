import _logger from "electron-log";
import R from "ramda";
import {from, of} from "rxjs";

import {AccountType} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {
    EntityMap,
    FolderWithMailsReference as Folder,
    FsDbAccount,
    MAIL_FOLDER_TYPE,
    MemoryDb,
    MemoryDbAccount,
} from "src/shared/model/database";
import {NOTIFICATION_SUBJECT} from "src/electron-main/api/constants";
import {Unpacked} from "src/shared/types";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[database api]");

type Methods =
    | "dbPatch"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, metadata, forceFlush, ...rest}) => from((async () => {
            logger.info("dbPatch()");

            const key = {type, login};
            const account = ctx.db.getAccount(key) || ctx.db.initAccount(key);
            const patchState = {modified: false};

            for (const entityType of (["mails", "folders", "contacts"] as ["mails", "folders", "contacts"])) {
                const source = rest[entityType];
                const destination = account[entityType];

                source.remove.forEach(({pk}) => {
                    destination.delete(pk);
                    patchState.modified = true;
                });

                for (const entity of source.upsert) {
                    await (destination as EntityMap<typeof entity>).validateAndSet(entity);
                    patchState.modified = true;
                }
            }

            if (patchMetadata(type, account.metadata, metadata)) {
                patchState.modified = true;
            }

            if (patchState.modified || forceFlush) {
                await ctx.db.saveToFile();
            }

            if (patchState.modified) {
                NOTIFICATION_SUBJECT.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({key, stat: ctx.db.accountStat(account)}));
            }

            return account.metadata;
        })()),

        dbGetAccountMetadata: ({type, login}) => {
            logger.info("dbGetAccountMetadata()");

            const account = ctx.db.getAccount({type, login});

            return of(account ? account.metadata : null);
        },

        dbGetAccountDataView: ({type, login}) => {
            logger.info("dbGetAccountDataView()");

            const account = ctx.db.getFsAccount({type, login});
            const accountDataView = prepareAccountDataView(account);

            return of(accountDataView);
        },
    };
}

export function patchMetadata(
    type: AccountType,
    dest: MemoryDbAccount["metadata"],
    patch: Partial<MemoryDbAccount["metadata"]>,
): boolean {
    logger.verbose("patchMetadata()");

    if (type !== "tutanota") {
        throw new Error(`"patchMetadata()": not yet implemented for "${type}" email provider`);
    }

    if (!("groupEntityEventBatchIds" in patch) || !patch.groupEntityEventBatchIds) {
        return false;
    }

    const patchSize = Object.keys(patch.groupEntityEventBatchIds).length;

    if (!patchSize) {
        return false;
    }

    Object.assign(
        (dest as typeof patch).groupEntityEventBatchIds,
        patch.groupEntityEventBatchIds,
    );
    logger.verbose(
        "patchMetadata()",
        `"metadata.groupEntityEventBatchIds" patched with ${patchSize} records`,
    );

    return true;
}

// TODO consider moving performance expensive operations to webworker
function prepareAccountDataView<T extends keyof MemoryDb>(
    input?: FsDbAccount<T>,
): Unpacked<ReturnType<Endpoints["dbGetAccountDataView"]>> {
    const {folders: foldersRecord, mails: mailsRecord, contacts} = input || {folders: {}, mails: {}, contacts: {}};
    const mails = Object.values(mailsRecord);
    const folders: Folder[] = [];

    for (const pk in foldersRecord) {
        if (!foldersRecord.hasOwnProperty(pk)) {
            continue;
        }

        const folder: Folder = {
            ...foldersRecord[pk],
            mails: [],
        };

        mails
            .filter((mailItem) => mailItem.mailFolderIds.includes(folder.mailFolderId))
            .forEach((mail) => folder.mails.push({...mail, folder}));

        folders.push(folder);
    }

    return {
        folders: prepareFoldersView(folders),
        contacts,
    };
}

const prepareFoldersView: (folders: Folder[]) => {
    system: Folder[];
    custom: Folder[];
} = (() => {
    const customizers: Record<keyof typeof MAIL_FOLDER_TYPE._.nameValueMap, {
        title: (f: Folder) => string;
        order: number;
    }> = {
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
    };
    type Customizer = typeof customizers[keyof typeof MAIL_FOLDER_TYPE._.nameValueMap];
    type CustomizerResolver = (folder: Folder) => Customizer;
    const sortByName = R.sortBy(R.prop(((prop: keyof Pick<Folder, "name">) => prop)("name")));
    const customizerSortDiff = (customizer: CustomizerResolver) => (o1: Folder, o2: Folder) => customizer(o1).order - customizer(o2).order;

    return (folders: Folder[]) => {
        const customizer: CustomizerResolver = (() => {
            const cache = new Map(
                folders.map((folder) => [
                    folder, customizers[MAIL_FOLDER_TYPE._.resolveNameByValue(folder.folderType)],
                ] as [Folder, Customizer]),
            );
            return (folder: Folder): Customizer => cache.get(folder) as Customizer;
        })();
        const result = {
            system: R.sort(customizerSortDiff(customizer), folders.filter((folder) => folder.folderType !== MAIL_FOLDER_TYPE.CUSTOM)),
            custom: sortByName(folders.filter((folder) => folder.folderType === MAIL_FOLDER_TYPE.CUSTOM)),
        };

        result.system.forEach((folder) => folder.name = customizer(folder).title(folder));

        return result;
    };
})();
