import UUID from "pure-uuid";
import electronLog from "electron-log";
import {Observable, of, race, throwError, timer} from "rxjs";
import {concatMap, filter, mergeMap, take} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {IndexableMailId, View} from "src/shared/model/database";
import {curryFunctionMembers, walkConversationNodesTree} from "src/shared/util";
import {searchRootConversationNodes} from "src/electron-main/api/endpoints-builders/database/search/service";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/search/api]");

export async function buildDbSearchEndpoints(
    ctx: DeepReadonly<Context>,
): Promise<Pick<IpcMainApiEndpoints, "dbSearchRootConversationNodes" | "dbFullTextSearch">> {
    return {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbSearchRootConversationNodes({login, folderPks, ...restOptions}) {
            logger.info("dbSearchRootConversationNodes()");

            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "login"`);
            }

            const mailPks = "query" in restOptions
                ? [] // TODO execute the actual search and pick "mailPks" from the search result
                : restOptions.mailPks;

            return searchRootConversationNodes(account, {folderPks, mailPks});
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbFullTextSearch({login, query, folderPks, hasAttachments, sentDateAfter}) {
            logger.info("dbFullTextSearch()");

            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error("Failed to resolve the account");
            }

            const searchUid: string | null = query
                ? new UUID(4).format()
                : null;
            const search$: Observable<DeepReadonly<NoExtraProperties<{ mailScoresByPk?: Map<IndexableMailId, number> }>>> = query
                ? race(
                    IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
                        filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.SearchResult),
                        filter(({payload}) => payload.uid === searchUid),
                        take(1),
                        mergeMap(({payload: {data: {items}}}) => {
                            const mailScoresByPk = new Map<IndexableMailId, number>(
                                items.map(({key, score}) => [key, score] as [IndexableMailId, number]),
                            );
                            return [{mailScoresByPk}];
                        }),
                    ),
                    await (async() => {
                        const {timeouts: {fullTextSearch: timeoutMs}} = await ctx.config$.pipe(take(1)).toPromise();
                        return timer(timeoutMs).pipe(
                            concatMap(() => throwError(new Error(`Failed to complete the search in ${timeoutMs}ms`))),
                        );
                    })(),
                ) : of({});
            const result$ = search$.pipe(
                mergeMap(({mailScoresByPk}) => {
                    const rootConversationNodes = searchRootConversationNodes(
                        account,
                        {
                            mailPks: mailScoresByPk
                                ? [...mailScoresByPk.keys()]
                                : undefined,
                            folderPks,
                        },
                    );
                    const filterByFolder = folderPks
                        ? ({pk}: View.Folder): boolean => folderPks.includes(pk)
                        : () => true;
                    const filterByHasAttachment = hasAttachments
                        ? (attachmentsCount: number): boolean => Boolean(attachmentsCount)
                        : () => true;
                    const filterBySentDateAfter = (() => {
                        const sentDateAfterFilterValue: number | null = sentDateAfter
                            ? new Date(String(sentDateAfter).trim()).getTime()
                            : null;
                        return sentDateAfterFilterValue
                            ? (sentDate: number): boolean => sentDate > sentDateAfterFilterValue
                            : () => true;
                    })();
                    const getScore: (mail: Exclude<View.ConversationNode["mail"], undefined>) => number | undefined | null
                        = mailScoresByPk
                        ? ({pk}) => mailScoresByPk.get(pk)
                        : () => null; // no full-text search executing happened, so no score provided
                    const mailsBundleItems: Unpacked<ReturnType<IpcMainApiEndpoints["dbFullTextSearch"]>>["mailsBundleItems"] = [];

                    for (const rootConversationNode of rootConversationNodes) {
                        let allNodeMailsCount = 0;
                        const matchedScoredNodeMails: Array<Unpacked<typeof mailsBundleItems>["mail"]> = [];

                        walkConversationNodesTree([rootConversationNode], ({mail}) => {
                            if (!mail) {
                                return;
                            }

                            allNodeMailsCount++;

                            const score = getScore(mail);

                            if (
                                (
                                    score === null // no full-text search executing happened, so accept all mails in this filter
                                    ||
                                    typeof score === "number"
                                )
                                &&
                                mail.folders.find(filterByFolder)
                                &&
                                filterByHasAttachment(mail.attachmentsCount)
                                &&
                                filterBySentDateAfter(mail.sentDate)
                            ) {
                                matchedScoredNodeMails.push({...mail, score: score ?? undefined});
                            }
                        });

                        if (!matchedScoredNodeMails.length) {
                            continue;
                        }

                        mailsBundleItems.push(
                            ...matchedScoredNodeMails.map((mail) => ({mail, conversationSize: allNodeMailsCount})),
                        );
                    }

                    return [{mailsBundleItems, searched: Boolean(searchUid)}];
                }),
            );

            if (searchUid) {
                IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Search({
                        query,
                        key: {login},
                        uid: searchUid,
                    }),
                );
            }

            return result$.toPromise();
        },
    };
}
