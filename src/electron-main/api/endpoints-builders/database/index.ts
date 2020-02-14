import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {omit} from "remeda";
import {v4 as uuid} from "uuid";

import {Context} from "src/electron-main/model";
import {DB_DATA_CONTAINER_FIELDS, IndexableMail} from "src/shared/model/database";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {buildDbExportEndpoints} from "./export";
import {buildDbIndexingEndpoints, narrowIndexActionPayload} from "./indexing";
import {buildDbSearchEndpoints, searchRootConversationNodes} from "./search";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {patchMetadata} from "src/electron-main/database/util";
import {prepareFoldersView} from "./folders-view";
import {validateEntity} from "src/electron-main/database/validation";

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

        async dbPatch({forceFlush, login, metadata: metadataPatch, patch: entityUpdatesPatch}) {
            const logger = curryFunctionMembers(_logger, "dbPatch()");

            logger.info();

            const {db, sessionDb} = ctx;
            const key = {login} as const;
            const account = db.getMutableAccount(key) || db.initAccount(key);
            const sessionAccount = sessionDb.getMutableAccount(key) || sessionDb.initAccount(key);

            for (const entityType of DB_DATA_CONTAINER_FIELDS) {
                const {remove, upsert} = entityUpdatesPatch[entityType];

                // remove
                remove.forEach(({pk}) => {
                    delete account[entityType][pk];
                    delete sessionAccount[entityType][pk];
                    sessionAccount.deletedPks[entityType].push(pk);
                });

                // add
                for (const entity of upsert) {
                    const validatedEntity = await validateEntity(entityType, entity);
                    const {pk} = entity;
                    account[entityType][pk] = validatedEntity;
                    sessionAccount[entityType][pk] = validatedEntity;
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

            const metadataModified = patchMetadata(account.metadata, metadataPatch, "dbPatch");
            const sessionMetadataModified = patchMetadata(sessionAccount.metadata, metadataPatch, "dbPatch");
            const entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);

            logger.verbose(JSON.stringify({entitiesModified, metadataModified, sessionMetadataModified, forceFlush}));

            setTimeout(async () => {
                // TODO consider caching the config
                const {disableSpamNotifications} = await ctx.configStore.readExisting();
                const includingSpam = !disableSpamNotifications;

                IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                    key,
                    entitiesModified,
                    metadataModified,
                    stat: db.accountStat(account, includingSpam),
                }));
            });

            if (
                (entitiesModified || sessionMetadataModified)
                ||
                forceFlush
            ) {
                await sessionDb.saveToFile();
            }

            return account.metadata;
        },

        async dbGetAccountMetadata({login}) {
            _logger.info("dbGetAccountMetadata()");

            const account = ctx.db.getAccount({login});

            return account ? account.metadata : null;
        },

        async dbGetAccountDataView({login}) {
            _logger.info("dbGetAccountDataView()");

            const account = ctx.db.getAccount({login});

            if (!account) {
                return false;
            }

            return {
                folders: prepareFoldersView(account),
            };
        },

        async dbGetAccountMail({login, pk}) {
            _logger.info("dbGetAccountMail()");

            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "login"`);
            }

            const mail = account.mails[pk];

            if (!mail) {
                throw new Error(`Failed to resolve mail by the provided "pk"`);
            }

            return {
                ...omit(mail, ["body"]),
                // TODO test "dbGetAccountMail" setting "mail.body" through the "sanitizeHtml" call
                body: sanitizeHtml(mail.body),
            };
        },

        async dbSearchRootConversationNodes({login, folderPks, ...restOptions}) {
            _logger.info("dbSearchRootConversationNodes()");

            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "login"`);
            }

            // TODO fill "mailPks" array based on the execute search with "query" argument

            const mailPks = "query" in restOptions
                ? [] //  TODO execute the actual search
                : restOptions.mailPks;

            return searchRootConversationNodes(account, {folderPks, mailPks});
        },
    };
}
