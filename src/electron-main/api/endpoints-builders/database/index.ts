import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {from} from "rxjs";
import {omit} from "ramda";

import {Arguments, Unpacked} from "src/shared/types";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {EntityMap, MemoryDbAccount} from "src/shared/model/database";
import {NOTIFICATION_SUBJECT} from "src/electron-main/api/constants";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {prepareFoldersView} from "./folders-view";

const _logger = curryFunctionMembers(electronLog, "[database api]");

type Methods =
    | "dbPatch"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView"
    | "dbGetAccountMail";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, metadata: metadataPatch, forceFlush, ...entityUpdatesPatch}) => from((async (
            logger = curryFunctionMembers(_logger, "dbPatch()"),
        ) => {
            logger.info();

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
            const metadataModified = patchMetadata(account.metadata, metadataPatch);
            const modified = entitiesModified || metadataModified;

            logger.verbose(JSON.stringify({entitiesModified, metadataModified, modified, forceFlush}));

            if (modified || forceFlush) {
                await ctx.db.saveToFile();
            }

            NOTIFICATION_SUBJECT.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                key,
                entitiesModified,
                metadataModified,
                stat: ctx.db.accountStat(account),
            }));

            return account.metadata;
        })()),

        dbGetAccountMetadata: ({type, login}) => from((async (
            logger = curryFunctionMembers(_logger, "dbGetAccountMetadata()"),
        ) => {
            logger.info("dbGetAccountMetadata()");
            const account = ctx.db.getAccount({type, login});
            return account ? account.metadata : null;
        })()),

        dbGetAccountDataView: ({type, login}) => from((async (
            logger = curryFunctionMembers(_logger, "dbGetAccountDataView()"),
        ) => {
            logger.info("dbGetAccountDataView()");

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                return undefined;
            }

            return {
                folders: prepareFoldersView(account),
                contacts: account.contacts,
            };
        })()),

        dbGetAccountMail: ({type, login, pk}) => from((async (
            logger = curryFunctionMembers(_logger, "dbGetAccountDataView()"),
        ) => {
            logger.info("dbGetAccountMail()");

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                throw new Error(`Database access error: failed to resolve account by the provided "type/login"`);
            }

            const mail = account.mails[pk];

            if (!mail) {
                throw new Error(`Database access error: failed to resolve mail by the provided "pk"`);
            }

            return {
                ...omit(["body"], mail),
                // TODO test "dbGetAccountMail" sets "mail.body" through the "sanitizeHtml" call
                body: sanitizeHtml(mail.body),
            };
        })()),
    };
}

function patchMetadata(
    dest: MemoryDbAccount["metadata"],
    rawPatch: Arguments<Unpacked<ReturnType<typeof buildEndpoints>>["dbPatch"]>[0]["metadata"],
    logger = curryFunctionMembers(_logger, "patchMetadata()"),
): boolean {
    logger.info();

    if (dest.type === "tutanota" && (rawPatch as typeof dest).groupEntityEventBatchIds) {
        const patch = (rawPatch as typeof dest);
        const patchSize = Object.keys(patch.groupEntityEventBatchIds).length;

        if (!patchSize) {
            return false;
        }

        dest.groupEntityEventBatchIds = {
            ...dest.groupEntityEventBatchIds,
            ...patch.groupEntityEventBatchIds,
        };
        logger.verbose(`"groupEntityEventBatchIds" patched with ${patchSize} records`);

        return true;
    }

    if (dest.type === "protonmail" && (rawPatch as typeof dest).latestEventId) {
        dest.latestEventId = (rawPatch as typeof dest).latestEventId;
        logger.verbose(`"latestEventId" patched`);

        return true;
    }

    return false;
}
