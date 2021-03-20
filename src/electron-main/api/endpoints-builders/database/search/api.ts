import UUID from "pure-uuid";
import electronLog from "electron-log";
import {Observable, from, of, race, throwError, timer} from "rxjs";
import {concatMap, filter, first, mergeMap, switchMap} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {IndexableMailId} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";
import {searchRootConversationNodes, secondSearchStep} from "src/electron-main/api/endpoints-builders/database/search/service";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/search/api]");

export async function buildDbSearchEndpoints(
    ctx: DeepReadonly<Context>,
): Promise<Pick<IpcMainApiEndpoints, "dbSearchRootConversationNodes" | "dbFullTextSearch">> {
    return {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbSearchRootConversationNodes({login, folderIds, ...restOptions}) {
            logger.info("dbSearchRootConversationNodes()");

            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "login"`);
            }

            const mailPks = "query" in restOptions
                ? [] // TODO execute the actual search and pick "mailPks" from the search result
                : restOptions.mailPks;

            return searchRootConversationNodes(account, {folderIds, mailPks});
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbFullTextSearch({query, ...searchCriteria}) {
            logger.info("dbFullTextSearch()");

            const fullTextSearchUid: string | null = query
                ? new UUID(4).format()
                : null;
            const fullTextSearch$: Observable<Map<IndexableMailId, number> | null> = query
                ? race(
                    IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
                        filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.SearchResult),
                        filter(({payload}) => payload.uid === fullTextSearchUid),
                        first(),
                        mergeMap(({payload: {data: {items}}}) => [new Map<IndexableMailId, number>(
                            items.map(({key, score}) => [key, score] as [IndexableMailId, number]),
                        )]),
                    ),
                    await (async () => {
                        const {timeouts: {fullTextSearch: timeoutMs}} = await ctx.config$.pipe(first()).toPromise();
                        return timer(timeoutMs).pipe(
                            concatMap(() => throwError(new Error(`Failed to complete the search in ${timeoutMs}ms`))),
                        );
                    })(),
                )
                : of(null);
            const result$ = fullTextSearch$.pipe(
                switchMap((mailScoresByPk) => {
                    return from(
                        (async () => {
                            return {
                                mailsBundleItems: await secondSearchStep(ctx, searchCriteria, mailScoresByPk),
                                searched: Boolean(fullTextSearchUid),
                            };
                        })(),
                    );
                }),
            );

            if (fullTextSearchUid) {
                IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
                    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Search({query, uid: fullTextSearchUid}),
                );
            }

            return result$.toPromise();
        },
    };
}
