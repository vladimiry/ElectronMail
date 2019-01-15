import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {Observable, from, of, race, throwError, timer} from "rxjs";
import {UnionOf} from "@vladimiry/unionize";
import {app, dialog} from "electron";
import {concatMap, filter, map, mergeMap, startWith} from "rxjs/operators";
import {equals, mergeDeepRight, omit, pick} from "ramda";
import {v4 as uuid} from "uuid";

import {Arguments, Unpacked} from "src/shared/types";
import {Context} from "src/electron-main/model";
import {DEFAULT_API_CALL_TIMEOUT} from "src/shared/constants";
import {
    Endpoints,
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS,
    IPC_MAIN_API_DB_INDEXER_ON_ACTIONS,
    IPC_MAIN_API_NOTIFICATION_ACTIONS,
} from "src/shared/api/main";
import {
    EntityMap,
    INDEXABLE_MAIL_FIELDS_STUB_CONTAINER,
    IndexableMail,
    IndexableMailId,
    MemoryDbAccount,
    View,
} from "src/shared/model/database";
import {
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION$,
    IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$,
    IPC_MAIN_API_NOTIFICATION$,
} from "src/electron-main/api/constants";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty, walkConversationNodesTree} from "src/shared/util";
import {prepareFoldersView} from "./folders-view";
import {searchRootConversationNodes} from "./search";
import {writeEmlFile} from "./export";

const _logger = curryFunctionMembers(electronLog, "[electron-main/api/endpoints-builders/database]");

type Methods =
    | "dbPatch"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView"
    | "dbGetAccountMail"
    | "dbExport"
    | "dbSearchRootConversationNodes"
    | "dbFullTextSearch"
    | "dbIndexerOn"
    | "dbIndexerNotification";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, metadata: metadataPatch, forceFlush, patch: entityUpdatesPatch}) => from((async (
            logger = curryFunctionMembers(_logger, "dbPatch()"),
        ) => {
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
                        narrowIndexActionPayload({
                            key,
                            add: source.upsert as IndexableMail[],
                            remove: source.remove,
                        }),
                    ),
                );
            }

            modifiedState.entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);
            modifiedState.metadataModified = patchMetadata(account.metadata, metadataPatch);
            modifiedState.modified = modifiedState.entitiesModified || modifiedState.metadataModified;

            logger.verbose(JSON.stringify({...modifiedState, forceFlush}));

            if (modifiedState.modified || forceFlush) {
                await ctx.db.saveToFile();
            }

            // TODO consider caching the config
            const {disableSpamNotifications} = await (await ctx.deferredEndpoints.promise).readConfig().toPromise();

            IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                key,
                entitiesModified: modifiedState.entitiesModified,
                metadataModified: modifiedState.metadataModified,
                stat: ctx.db.accountStat(account, !disableSpamNotifications),
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
            logger.info();

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
            logger = curryFunctionMembers(_logger, "dbGetAccountMail()"),
        ) => {
            logger.info();

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
        })()),

        dbExport: ({type, login, mailPks}) => ((
            logger = curryFunctionMembers(_logger, "dbExport()"),
        ) => new Observable<Unpacked<ReturnType<Endpoints["dbExport"]>>>((subscriber) => {
            logger.info();

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
        }))(),

        dbSearchRootConversationNodes: ({type, login, folderPks, ...restOptions}) => from((async (
            logger = curryFunctionMembers(_logger, "dbSearchRootConversationNodes()"),
        ) => {
            logger.info();

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "type/login"`);
            }

            // TODO fill "mailPks" array based on the execute search with "query" argument

            const mailPks = "query" in restOptions
                ? [] //  TODO execute the actual search
                : restOptions.mailPks;

            return searchRootConversationNodes(account, {folderPks, mailPks});
        })()),

        dbFullTextSearch: (() => {
            const logger = curryFunctionMembers(_logger, "dbFullTextSearch()");
            const timeoutMs = DEFAULT_API_CALL_TIMEOUT;
            const method: Pick<Endpoints, "dbFullTextSearch">["dbFullTextSearch"] = ({type, login, query, folderPks}) => {
                logger.info();

                const account = ctx.db.getFsAccount({type, login});

                if (!account) {
                    throw new Error(`Failed to resolve account by the provided "type/login"`);
                }

                const uid = uuid();
                const result$ = race(
                    IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
                        filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.SearchResult),
                        filter(({payload}) => payload.uid === uid),
                        mergeMap(({payload: {data: {items, expandedTerms}}}) => {
                            const mailScoresByPk = new Map<IndexableMailId, number>(
                                items.map(({docId, score}) => [docId, score] as [IndexableMailId, number]),
                            );
                            const rootConversationNodes = searchRootConversationNodes(
                                account,
                                {mailPks: [...mailScoresByPk.keys()], folderPks},
                            );
                            const mailsBundleItems: Unpacked<ReturnType<Endpoints["dbFullTextSearch"]>>["mailsBundleItems"] = [];
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
                ).pipe(
                    map((value) => {
                        return value;
                    }),
                );

                IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Search({
                        key: {type, login},
                        query,
                        uid,
                    }),
                );

                return result$;
            };

            return method;
        })(),

        dbIndexerOn: (() => {
            const logger = curryFunctionMembers(_logger, "dbIndexerOn()");
            const method: Pick<Endpoints, "dbIndexerOn">["dbIndexerOn"] = (action) => {
                logger.info(`action.type: ${action.type}`);

                // propagating action to custom stream
                IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.next(action);

                IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.match(action, {
                    Bootstrapped: () => {
                        ctx.db.iterateAccounts(({pk: key, account}) => {
                            IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                                IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Index(
                                    narrowIndexActionPayload({
                                        key,
                                        remove: [],
                                        add: [...account.mails.values()],
                                    }),
                                ),
                            );
                        });
                    },
                    ProgressState: (payload) => {
                        logger.verbose(`ProgressState.status: ${payload.status}`);

                        // propagating status to main channel which streams data to UI process
                        IPC_MAIN_API_NOTIFICATION$.next(
                            IPC_MAIN_API_NOTIFICATION_ACTIONS.DbIndexerProgressState(payload),
                        );
                    },
                    default: () => {
                        // NOOP
                    },
                });

                return of(null);
            };

            return method;
        })(),

        dbIndexerNotification: () => IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.asObservable().pipe(
            startWith(IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Bootstrap({})),
        ),
    };
}

function patchMetadata(
    dest: MemoryDbAccount["metadata"],
    patch: Arguments<Unpacked<ReturnType<typeof buildEndpoints>>["dbPatch"]>[0]["metadata"],
    logger = curryFunctionMembers(_logger, "patchMetadata()"),
): boolean {
    logger.info();

    const merged = mergeDeepRight(dest, patch);

    // console.log(JSON.stringify({dest, patch, merged}, null, 2));

    if (equals(dest, merged)) {
        return false;
    }

    Object.assign(dest, merged);

    logger.verbose(`metadata patched with ${JSON.stringify(Object.keys(patch))} properties`);

    return true;
}

type IndexActionPayload = Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>, { type: "Index" }>["payload"];

function narrowIndexActionPayload({key, add, remove}: IndexActionPayload): IndexActionPayload {
    const mailFieldsToSelect = [
        ((name: keyof Pick<Unpacked<typeof add>, "pk">) => name)("pk"),
        ...Object.keys(INDEXABLE_MAIL_FIELDS_STUB_CONTAINER),
    ] as Array<keyof Unpacked<typeof add>>;

    return {
        key,
        remove,
        add: add.map((mail) => pick(mailFieldsToSelect, mail)),
    };
}
