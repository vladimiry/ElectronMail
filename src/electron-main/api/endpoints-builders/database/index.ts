import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {Observable, race, throwError, timer} from "rxjs";
import {app, dialog} from "electron";
import {concatMap, filter, mergeMap, startWith, take} from "rxjs/operators";
import {equals, mergeDeepRight, omit} from "ramda";
import {inspect} from "util";
import {performance} from "perf_hooks";
import {v4 as uuid} from "uuid";

import {Context} from "src/electron-main/model";
import {DEFAULT_API_CALL_TIMEOUT} from "src/shared/constants";
import {EntityMap, IndexableMail, IndexableMailId, MemoryDbAccount, View} from "src/shared/model/database";
import {
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION$,
    IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$,
    IPC_MAIN_API_NOTIFICATION$,
} from "src/electron-main/api/constants";
import {
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS,
    IPC_MAIN_API_DB_INDEXER_ON_ACTIONS,
    IPC_MAIN_API_NOTIFICATION_ACTIONS,
    IpcMainApiEndpoints,
    IpcMainServiceScan,
} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty, walkConversationNodesTree} from "src/shared/util";
import {indexAccount, narrowIndexActionPayload} from "./indexing";
import {prepareFoldersView} from "./folders-view";
import {searchRootConversationNodes} from "./search";
import {writeEmlFile} from "./export";

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

const dbPatchState: {
    lastWriteAttemptMark?: ReturnType<typeof performance.now>;
    // WARN: "timeOutId" can't be just passed through "JSON.stringify": Converting circular structure to JSON
    // so "util.inspect" needs to be used
    timeOutId?: ReturnType<typeof setTimeout>;
} = {};

export async function buildEndpoints(ctx: Context): Promise<Pick<IpcMainApiEndpoints, Methods>> {
    return {
        async dbPatch({immediateWrite = true, forceFlush, type, login, metadata: metadataPatch, patch: entityUpdatesPatch}) {
            const logger = curryFunctionMembers(_logger, "dbPatch()");

            logger.info();

            const key = {type, login};
            const account = ctx.db.getAccount(key) || ctx.db.initAccount(key);
            const entityTypes: ["conversationEntries", "mails", "folders", "contacts"]
                = ["conversationEntries", "mails", "folders", "contacts"];
            const modifiedState: { entitiesModified: boolean, metadataModified: boolean, modified?: boolean } = {
                entitiesModified: false,
                metadataModified: false,
            };

            for (const entityType of entityTypes) {
                const source = entityUpdatesPatch[entityType];
                const destinationMap = account[entityType];

                // remove
                source.remove.forEach(({pk}) => {
                    destinationMap.delete(pk);
                });

                // add
                for (const entity of source.upsert) {
                    await (destinationMap as EntityMap<typeof entity>).validateAndSet(entity);
                }

                if (entityType !== "mails") {
                    continue;
                }

                IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Index(
                        {
                            uid: uuid(),
                            ...narrowIndexActionPayload({
                                key,
                                add: source.upsert as IndexableMail[], // TODO send data as chunks
                                remove: source.remove,
                            }),
                        },
                    ),
                );
            }

            modifiedState.entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);
            modifiedState.metadataModified = patchMetadata(account.metadata, metadataPatch);
            modifiedState.modified = modifiedState.entitiesModified || modifiedState.metadataModified;

            logger.verbose(JSON.stringify({...modifiedState, forceFlush}));

            // TODO consider caching the config
            const {
                disableSpamNotifications,
                databaseWriteDelayMs,
            } = await (await ctx.deferredEndpoints.promise).readConfig();

            IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                key,
                entitiesModified: modifiedState.entitiesModified,
                metadataModified: modifiedState.metadataModified,
                stat: ctx.db.accountStat(account, !disableSpamNotifications),
            }));

            const needToWrite = modifiedState.modified || forceFlush;

            if (needToWrite) {
                const lastWriteAttemptMark = performance.now();
                const saveDelayedMs: false | number = (
                    typeof dbPatchState.lastWriteAttemptMark !== "undefined"
                    &&
                    lastWriteAttemptMark - dbPatchState.lastWriteAttemptMark
                );
                const writingNow = (
                    immediateWrite
                    ||
                    typeof databaseWriteDelayMs !== "number" || isNaN(databaseWriteDelayMs) || databaseWriteDelayMs === 0
                    ||
                    typeof saveDelayedMs === "number" && saveDelayedMs >= databaseWriteDelayMs
                );

                logger.verbose(
                    "[write]",
                    inspect({dbPatchState, databaseWriteDelayMs, immediateWrite, saveDelayedMs, writingNow}),
                );

                dbPatchState.lastWriteAttemptMark = lastWriteAttemptMark;

                if (writingNow) {
                    if (typeof dbPatchState.timeOutId !== "undefined") {
                        logger.verbose(`[write] resetting "dbPatchState.timeOutId"`, inspect(dbPatchState));
                        clearTimeout(dbPatchState.timeOutId);
                        delete dbPatchState.timeOutId;
                    }

                    await ctx.db.saveToFile();
                } else {
                    const remainingSaveDelayMs = saveDelayedMs
                        ? databaseWriteDelayMs - saveDelayedMs
                        : databaseWriteDelayMs;

                    logger.verbose(`[write] setting up write timeout`, inspect({dbPatchState, remainingSaveDelayMs}));

                    dbPatchState.timeOutId = setTimeout(
                        async () => {
                            delete dbPatchState.timeOutId;

                            dbPatchState.lastWriteAttemptMark = performance.now();

                            try {
                                await ctx.db.saveToFile();
                            } catch (error) {
                                IPC_MAIN_API_NOTIFICATION$.next(
                                    IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({
                                        message: [
                                            `Failed to write "${ctx.db.options.file}" file`,
                                            `, see "${electronLog.transports.file.file}" file for details`,
                                        ].join(""),
                                    }),
                                );

                                logger.error(error);
                            }
                        },
                        remainingSaveDelayMs,
                    );
                }
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

        dbExport({type, login, mailPks}) {
            _logger.info("dbExport()");

            return new Observable<IpcMainServiceScan["ApiImplReturns"]["dbExport"]>((subscriber) => {
                const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

                if (!browserWindow) {
                    return subscriber.error(new Error(`Failed to resolve main app window`));
                }

                const [dir]: Array<string | undefined> = dialog.showOpenDialog(
                    browserWindow,
                    {
                        title: "Select directory to export emails to the EML files",
                        defaultPath: app.getPath("home"),
                        properties: ["openDirectory"],
                    },
                ) || [];

                if (!dir) {
                    return subscriber.complete();
                }

                const account = ctx.db.getFsAccount({type, login});

                if (!account) {
                    return subscriber.error(new Error(`Failed to resolve account by the provided "type/login"`));
                }

                const mails = mailPks
                    ? Object.values(account.mails).filter(({pk}) => mailPks.includes(pk))
                    : Object.values(account.mails);
                const count = mails.length;

                subscriber.next({count});

                const promise = (async () => {
                    for (let index = 0; index < count; index++) {
                        const {file} = await writeEmlFile(mails[index], dir);
                        subscriber.next({file, progress: +((index + 1) / count * 100).toFixed(2)});
                    }
                })();

                promise
                    .then(() => subscriber.complete())
                    .catch((error) => subscriber.error(error));
            });
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

        dbFullTextSearch({type, login, query, folderPks}) {
            _logger.info("dbFullTextSearch()");

            const timeoutMs = DEFAULT_API_CALL_TIMEOUT;
            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "type/login"`);
            }

            const uid = uuid();
            const result$ = race(
                IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
                    filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.SearchResult),
                    filter(({payload}) => payload.uid === uid),
                    take(1),
                    mergeMap(({payload: {data: {items, expandedTerms}}}) => {
                        const mailScoresByPk = new Map<IndexableMailId, number>(
                            items.map(({key, score}) => [key, score] as [IndexableMailId, number]),
                        );
                        const rootConversationNodes = searchRootConversationNodes(
                            account,
                            {mailPks: [...mailScoresByPk.keys()], folderPks},
                        );
                        const mailsBundleItems: Unpacked<ReturnType<IpcMainApiEndpoints["dbFullTextSearch"]>>["mailsBundleItems"] = [];
                        const findByFolder = folderPks
                            ? ({pk}: View.Folder) => folderPks.includes(pk)
                            : () => true;

                        for (const rootConversationNode of rootConversationNodes) {
                            let allNodeMailsCount = 0;
                            const matchedScoredNodeMails: Array<Unpacked<typeof mailsBundleItems>["mail"]> = [];

                            walkConversationNodesTree([rootConversationNode], ({mail}) => {
                                if (!mail) {
                                    return;
                                }

                                allNodeMailsCount++;

                                const score = mailScoresByPk.get(mail.pk);

                                if (
                                    typeof score !== "undefined"
                                    &&
                                    mail.folders.find(findByFolder)
                                ) {
                                    matchedScoredNodeMails.push({...mail, score});
                                }
                            });

                            if (!matchedScoredNodeMails.length) {
                                continue;
                            }

                            mailsBundleItems.push(
                                ...matchedScoredNodeMails.map((mail) => ({
                                    mail,
                                    conversationSize: allNodeMailsCount,
                                })),
                            );
                        }

                        return [{
                            uid,
                            mailsBundleItems,
                            expandedTerms,
                        }];
                    }),
                ),
                timer(timeoutMs).pipe(
                    concatMap(() => throwError(new Error(`Failed to complete the search in ${timeoutMs}ms`))),
                ),
            );

            IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Search({
                    key: {type, login},
                    query,
                    uid,
                }),
            );

            return result$;
        },

        async dbIndexerOn(action) {
            const logger = curryFunctionMembers(_logger, "dbIndexerOn()");

            logger.info(`action.type: ${action.type}`);

            // propagating action to custom stream
            IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.next(action);

            IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.match(action, {
                Bootstrapped: () => {
                    setTimeout(async () => {
                        const logins = (await ctx.settingsStore.readExisting()).accounts.map((account) => account.login);
                        const config = await (await ctx.deferredEndpoints.promise).readConfig();

                        for (const {account, pk} of ctx.db.accountsIterator()) {
                            if (logins.includes(pk.login)) {
                                await indexAccount(account, pk, config);
                            }
                        }
                    });
                },
                ProgressState: (payload) => {
                    logger.verbose(`ProgressState.status: ${JSON.stringify(payload.status)}`);

                    // propagating status to main channel which streams data to UI process
                    IPC_MAIN_API_NOTIFICATION$.next(
                        IPC_MAIN_API_NOTIFICATION_ACTIONS.DbIndexerProgressState(payload),
                    );
                },
                default: () => {
                    // NOOP
                },
            });
        },

        dbIndexerNotification() {
            return IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.asObservable().pipe(
                startWith(IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Bootstrap({})),
            );
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
