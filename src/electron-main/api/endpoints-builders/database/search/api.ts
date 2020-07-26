import UUID from "pure-uuid";
import electronLog from "electron-log";
import {concatMap, filter, mergeMap, take} from "rxjs/operators";
import {race, throwError, timer} from "rxjs";

import {Context} from "src/electron-main/model";
import {DEFAULT_API_CALL_TIMEOUT} from "src/shared/constants";
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

            // TODO fill "mailPks" array based on the execute search with "query" argument

            const mailPks = "query" in restOptions
                ? [] //  TODO execute the actual search
                : restOptions.mailPks;

            return searchRootConversationNodes(account, {folderPks, mailPks});
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbFullTextSearch({login, query, folderPks, hasAttachments, sentDateAfter}) {
            logger.info("dbFullTextSearch()");

            const timeoutMs = DEFAULT_API_CALL_TIMEOUT;
            const account = ctx.db.getAccount({login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "type/login"`);
            }

            const uid = new UUID(4).format();
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
                        const filterByFolder = folderPks
                            ? ({pk}: View.Folder): boolean => folderPks.includes(pk)
                            : () => true;
                        const filterByHasAttachment = hasAttachments
                            ? (attachmentsCount: number): boolean => Boolean(attachmentsCount)
                            : () => true;
                        const filterBySentDateAfter = (() => {
                            const sentDateFilter: number | null = sentDateAfter
                                ? new Date(String(sentDateAfter).trim()).getTime()
                                : null;
                            return sentDateFilter
                                ? (sentDate: number): boolean => sentDate > sentDateFilter
                                : () => true;
                        })();

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
                                    mail.folders.find(filterByFolder)
                                    &&
                                    filterByHasAttachment(mail.attachmentsCount)
                                    &&
                                    filterBySentDateAfter(mail.sentDate)
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
                    key: {login},
                    query,
                    uid,
                }),
            );

            return result$.toPromise();
        },
    };
}
