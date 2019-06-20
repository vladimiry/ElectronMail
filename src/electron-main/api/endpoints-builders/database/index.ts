import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {equals, mergeDeepRight, omit} from "ramda";
import {v4 as uuid} from "uuid";

import {Context} from "src/electron-main/model";
import {DB_DATA_CONTAINER_FIELDS, EntityMap, IndexableMail, MemoryDbAccount} from "src/shared/model/database";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {buildDbExportEndpoints} from "./export";
import {buildDbIndexingEndpoints, narrowIndexActionPayload} from "./indexing";
import {buildDbSearchEndpoints, searchRootConversationNodes} from "./search";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {prepareFoldersView} from "./folders-view";

const _logger = curryFunctionMembers(electronLog, "[electron-main/api/endpoints-builders/database]");

type Methods = keyof Pick<IpcMainApiEndpoints,
    | "dbPatch"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView"
    | "dbGetAccountMail"
    | "dbExport"
    | "dbSearchRootConversationNodes"
    | "dbFullTextSearch"
    | "dbIndexerOn"
    | "dbIndexerNotification">;

export async function buildEndpoints(ctx: Context): Promise<Pick<IpcMainApiEndpoints, Methods>> {
    return {
        ...await buildDbExportEndpoints(ctx),
        ...await buildDbIndexingEndpoints(ctx),
        ...await buildDbSearchEndpoints(ctx),

        async dbPatch({forceFlush, type, login, metadata: metadataPatch, patch: entityUpdatesPatch}) {
            const logger = curryFunctionMembers(_logger, "dbPatch()");

            logger.info();

            const key = {type, login} as const;
            const account = ctx.db.getAccount(key) || ctx.db.initAccount(key);

            for (const entityType of DB_DATA_CONTAINER_FIELDS) {
                const {remove, upsert} = entityUpdatesPatch[entityType];
                const destinationMap: EntityMap<Unpacked<typeof upsert>> = account[entityType];

                // remove
                remove.forEach(({pk}) => {
                    destinationMap.delete(pk);
                });

                // add
                for (const entity of upsert) {
                    await destinationMap.validateAndSet(entity);
                }

                if (entityType !== "mails") {
                    continue;
                }

                // send mails indexing signal
                setTimeout(() => {
                    IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                        IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Index(
                            {
                                uid: uuid(),
                                ...narrowIndexActionPayload({
                                    key,
                                    add: upsert as IndexableMail[], // TODO send data as chunks
                                    remove,
                                }),
                            },
                        ),
                    );
                });
            }

            const metadataModified = patchMetadata(account.metadata, metadataPatch);
            const entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);
            const modified = entitiesModified || metadataModified;

            logger.verbose(JSON.stringify({entitiesModified, metadataModified, modified, forceFlush}));

            setTimeout(async () => {
                // TODO consider caching the config
                const {disableSpamNotifications} = await ctx.configStore.readExisting();
                const includingSpam = !disableSpamNotifications;

                IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                    key,
                    entitiesModified,
                    metadataModified,
                    stat: ctx.db.accountStat(account, includingSpam),
                }));
            });

            if (modified || forceFlush) {
                await ctx.db.saveToFile();
            }

            return account.metadata;
        },

        async dbGetAccountMetadata({type, login}) {
            _logger.info("dbGetAccountMetadata()");

            const account = ctx.db.getAccount({type, login});

            return account ? account.metadata : null;
        },

        async dbGetAccountDataView({type, login}) {
            _logger.info("dbGetAccountDataView()");

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                return undefined;
            }

            return {
                folders: prepareFoldersView(account),
            };
        },

        async dbGetAccountMail({type, login, pk}) {
            _logger.info("dbGetAccountMail()");

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "type/login"`);
            }

            const mail = account.mails[pk];

            if (!mail) {
                throw new Error(`Failed to resolve mail by the provided "pk"`);
            }

            return {
                ...omit(["body"], mail),
                // TODO test "dbGetAccountMail" setting "mail.body" through the "sanitizeHtml" call
                body: sanitizeHtml(mail.body),
            };
        },

        async dbSearchRootConversationNodes({type, login, folderPks, ...restOptions}) {
            _logger.info("dbSearchRootConversationNodes()");

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "type/login"`);
            }

            // TODO fill "mailPks" array based on the execute search with "query" argument

            const mailPks = "query" in restOptions
                ? [] //  TODO execute the actual search
                : restOptions.mailPks;

            return searchRootConversationNodes(account, {folderPks, mailPks});
        },
    };
}

function patchMetadata(
    dest: MemoryDbAccount["metadata"],
    // TODO TS: use patch: Arguments<IpcMainApiEndpoints["dbPatch"]>[0]["metadata"],
    patch: Omit<MemoryDbAccount<"protonmail">["metadata"], "type"> | Omit<MemoryDbAccount<"tutanota">["metadata"], "type">,
    logger = curryFunctionMembers(_logger, "patchMetadata()"),
): boolean {
    logger.info();

    if (
        "latestEventId" in patch
        &&
        (
            !patch.latestEventId
            ||
            !patch.latestEventId.trim()
        )
    ) {
        return false;
    }

    const merged = mergeDeepRight(dest, patch);

    // console.log(JSON.stringify({dest, patch, merged}, null, 2));

    if (equals(dest, merged)) {
        return false;
    }

    Object.assign(dest, merged);

    logger.verbose(`metadata patched with ${JSON.stringify(Object.keys(patch))} properties`);

    return true;
}
