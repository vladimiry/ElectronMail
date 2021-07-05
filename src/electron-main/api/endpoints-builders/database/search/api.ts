import UUID from "pure-uuid";
import electronLog from "electron-log";
import {from, lastValueFrom, Observable, of, race, throwError, timer} from "rxjs";
import {concatMap, filter, first, mergeMap, switchMap} from "rxjs/operators";
import {ofType} from "@ngrx/effects";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_DB_INDEXER_REQUEST$, IPC_MAIN_API_DB_INDEXER_RESPONSE$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS, IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS} from "src/shared/api/main-process/actions";
import {IndexableMailId} from "src/shared/model/database";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {curryFunctionMembers} from "src/shared/util";
import {searchRootConversationNodes, secondSearchStep} from "src/electron-main/api/endpoints-builders/database/search/service";

const logger = curryFunctionMembers(electronLog, __filename);

export async function buildDbSearchEndpoints(
    ctx: DeepReadonly<Context>,
): Promise<Pick<IpcMainApiEndpoints, "dbSearchRootConversationNodes" | "dbFullTextSearch">> {
    const endpoints: Unpacked<ReturnType<typeof buildDbSearchEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbSearchRootConversationNodes({login, folderIds, ...restOptions}) {
            logger.info(nameof(endpoints.dbSearchRootConversationNodes));

            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "login"`);
            }


            const mailPks = "query" in restOptions
                ? [] // TODO execute the actual search and pick "mailPks" from the search result
                : restOptions.mailPks;
            const config = await lastValueFrom(ctx.config$.pipe(first()));
            const {disableSpamNotifications} = config;

            return searchRootConversationNodes(account, {folderIds, mailPks}, !disableSpamNotifications);
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbFullTextSearch({query, ...searchCriteria}) {
            logger.info(nameof(endpoints.dbFullTextSearch));

            const fullTextSearchUid: string | null = query
                ? new UUID(4).format()
                : null;
            const fullTextSearch$: Observable<Map<IndexableMailId, number> | null> = query
                ? race(
                    IPC_MAIN_API_DB_INDEXER_RESPONSE$.pipe(
                        ofType(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.SearchResult),
                        filter(({payload}) => payload.uid === fullTextSearchUid),
                        first(),
                        mergeMap(({payload: {data: {items}}}) => [new Map<IndexableMailId, number>(
                            items.map(({key, score}) => [key, score] as [IndexableMailId, number]),
                        )]),
                    ),
                    await (async () => {
                        const config = await lastValueFrom(ctx.config$.pipe(first()));
                        const {timeouts: {fullTextSearch: timeoutMs}} = config;
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
                IPC_MAIN_API_DB_INDEXER_REQUEST$.next(
                    IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS.Search({query, uid: fullTextSearchUid}),
                );
            }

            return lastValueFrom(result$);
        },
    };

    return endpoints;
}
