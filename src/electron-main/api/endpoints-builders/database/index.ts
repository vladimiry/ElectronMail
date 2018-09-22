import _logger from "electron-log";
import sanitizeHtml from "sanitize-html";
import {from, of, throwError} from "rxjs";
import {omit} from "ramda";

import {AccountType} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {EntityMap, MemoryDbAccount} from "src/shared/model/database";
import {NOTIFICATION_SUBJECT} from "src/electron-main/api/constants";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {prepareFoldersView} from "./folders-view";

const logger = curryFunctionMembers(_logger, "[database api]");

type Methods =
    | "dbPatch"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView"
    | "dbGetAccountMail";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, metadata, forceFlush, ...entityUpdatesPatch}) => from((async () => {
            logger.info("dbPatch()");

            const key = {type, login};
            const account = ctx.db.getAccount(key) || ctx.db.initAccount(key);
            const entityTypes: ["conversationEntries", "mails", "folders", "contacts"]
                = ["conversationEntries", "mails", "folders", "contacts"];

            for (const entityType of entityTypes) {
                const source = entityUpdatesPatch[entityType];
                const destinationMap = account[entityType];

                source.remove.forEach(({pk}) => destinationMap.delete(pk));

                for (const entity of source.upsert) {
                    await (destinationMap as EntityMap<typeof entity>).validateAndSet(entity);
                }
            }

            const entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);
            const metadataModified = patchMetadata(type, account.metadata, metadata);
            const modified = entitiesModified || metadataModified;

            logger.verbose("dbPatch()", JSON.stringify({modified, forceFlush}));

            if (modified || forceFlush) {
                await ctx.db.saveToFile();
            }

            if (entitiesModified) {
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

            if (!account) {
                return of(undefined);
            }

            return of({
                folders: prepareFoldersView(account),
                contacts: account.contacts,
            });
        },

        dbGetAccountMail: ({type, login, pk}) => {
            logger.info("dbGetAccountMail()");

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                return throwError(`Database access error: failed to resolve account by the provided "type/login"`);
            }

            const mail = account.mails[pk];

            if (!mail) {
                return throwError(`Database access error: failed to resolve mail by the provided "pk"`);
            }

            return of({
                ...omit(["body"], mail),
                // TODO test "dbGetAccountMail" sets "mail.body" through the "sanitizeHtml" call
                body: sanitizeHtml(mail.body),
            });
        },
    };
}

function patchMetadata(
    type: AccountType,
    dest: MemoryDbAccount["metadata"],
    patch: Partial<MemoryDbAccount["metadata"]>,
): boolean {
    logger.info("patchMetadata()");

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
