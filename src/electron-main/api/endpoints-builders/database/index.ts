import UUID from "pure-uuid";
import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {first} from "rxjs/operators";
import {lastValueFrom} from "rxjs";
import {omit} from "remeda";

import {Context} from "src/electron-main/model";
import {DB_DATA_CONTAINER_FIELDS, IndexableMail} from "src/shared/model/database";
import {Database} from "src/electron-main/database";
import {IPC_MAIN_API_DB_INDEXER_REQUEST$, IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS, IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {buildDbExportEndpoints} from "./export/api";
import {buildDbIndexingEndpoints} from "./indexing/api";
import {buildDbSearchEndpoints} from "./search/api";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {narrowIndexActionPayload} from "./indexing/service";
import {patchMetadata} from "src/electron-main/database/util";
import {prepareFoldersView} from "./folders-view";
import {validateEntity} from "src/electron-main/database/validation";

const _logger = curryFunctionMembers(electronLog, __filename);

type Methods = keyof Pick<IpcMainApiEndpoints,
    | "dbPatch"
    | "dbResetDbMetadata"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView"
    | "dbGetAccountMail"
    | "dbExport"
    | "dbExportMailAttachmentsNotification"
    | "dbSearchRootConversationNodes"
    | "dbFullTextSearch"
    | "dbIndexerOn"
    | "dbIndexerNotification">;

export async function buildEndpoints(ctx: Context): Promise<Pick<IpcMainApiEndpoints, Methods>> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        ...await buildDbExportEndpoints(ctx),
        ...await buildDbIndexingEndpoints(ctx),
        ...await buildDbSearchEndpoints(ctx),

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbPatch({bootstrapPhase, login, metadata: metadataPatch, patch: entityUpdatesPatch}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.dbPatch));

            logger.info();

            const {db, sessionDb} = ctx;
            const accountKey = {login} as const;

            logger.verbose(JSON.stringify({bootstrapPhase}));

            if (bootstrapPhase === "initial") {
                // reset session db account so the bootstrap fetch outcome gets saved into the clear/empty session database
                sessionDb.initEmptyAccount(accountKey);
            }

            const account = db.getMutableAccount(accountKey) || db.initEmptyAccount(accountKey);
            const sessionAccount = sessionDb.getMutableAccount(accountKey) || sessionDb.initEmptyAccount(accountKey);

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

                if (entityType === "mails") {
                    setTimeout(() => {
                        // send mails to indexing process
                        // TODO performance optimization: send mails to indexing process if indexing feature activated
                        IPC_MAIN_API_DB_INDEXER_REQUEST$.next(
                            IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS.Index(
                                {
                                    uid: new UUID(4).format(),
                                    ...narrowIndexActionPayload({
                                        key: accountKey,
                                        add: upsert as IndexableMail[], // TODO send data as chunks
                                        remove,
                                    }),
                                },
                            ),
                        );
                    });
                }
            }

            const entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);
            const metadataModified = patchMetadata(account.metadata, metadataPatch, "dbPatch");
            const sessionMetadataModified = patchMetadata(sessionAccount.metadata, metadataPatch, "dbPatch");

            logger.verbose(JSON.stringify({entitiesModified, metadataModified, sessionMetadataModified}));

            if (bootstrapPhase === "final") {
                // reset db account before mering session db account into it
                db.initEmptyAccount(accountKey);

                // calculate stale ids, ie those that get removed after the session db account merge
                const staleMailPks = (() => {
                    {
                        const sessionAccount = sessionDb.getAccount(accountKey);
                        const account = db.getAccount(accountKey);
                        if (!sessionAccount || !account) {
                            return [];
                        }
                        const sessionMails = sessionAccount["mails"];
                        const allMailsPks = Object.keys(account["mails"]);
                        const staleMailsPks = allMailsPks.filter((mailPk) => !(mailPk in sessionMails));
                        return staleMailsPks.map((pk) => ({pk}));
                    }
                })();

                setTimeout(() => {
                    // removing stale mails form the full text search index
                    // TODO performance optimization: send mails to indexing process if indexing feature activated
                    IPC_MAIN_API_DB_INDEXER_REQUEST$.next(
                        IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS.Index(
                            {
                                uid: new UUID(4).format(),
                                ...narrowIndexActionPayload({
                                    key: accountKey,
                                    add: [],
                                    remove: staleMailPks,
                                }),
                            },
                        ),
                    );
                });

                if (
                    Database.mergeAccount(
                        sessionDb,
                        db,
                        accountKey,
                    )
                ) {
                    await db.saveToFile();
                }

                // reset session db account after it got merged into the primary db
                sessionDb.initEmptyAccount(accountKey);
                await sessionDb.saveToFile();
            }

            setTimeout(async () => {
                const config = await lastValueFrom(ctx.config$.pipe(first()));
                const {disableSpamNotifications} = config;

                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                        key: accountKey,
                        entitiesModified,
                        stat: db.accountStat(account, !disableSpamNotifications),
                    }),
                );
            });

            if (
                entitiesModified
                ||
                sessionMetadataModified
            ) {
                await sessionDb.saveToFile();
            }

            return account.metadata;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbResetDbMetadata({reset}) {
            if (reset) {
                for (const {account: {metadata}} of ctx.db) {
                    (metadata as Mutable<typeof metadata>).latestEventId = "";
                }
                await ctx.db.saveToFile();
            }
            await ctx.configStoreQueue.q(async () => {
                await ctx.configStore.write({
                    ...await ctx.configStore.readExisting(),
                    shouldRequestDbMetadataReset: "done",
                });
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbGetAccountMetadata({login}) {
            _logger.info(nameof(endpoints.dbGetAccountMetadata));

            const account = ctx.db.getAccount({login});

            return account ? account.metadata : null;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbGetAccountDataView({login}) {
            _logger.info(nameof(endpoints.dbGetAccountDataView));

            const account = ctx.db.getAccount({login});

            if (!account) {
                return false;
            }

            const config = await lastValueFrom(ctx.config$.pipe(first()));
            const {disableSpamNotifications} = config;

            return {
                folders: prepareFoldersView(account, !disableSpamNotifications),
            };
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbGetAccountMail({login, pk}) {
            _logger.info(nameof(endpoints.dbGetAccountMail));

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
    };

    return endpoints;
}
