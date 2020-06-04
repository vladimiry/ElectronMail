import UUID from "pure-uuid";
import electronLog from "electron-log";
import {concatMap, filter, mergeMap, take} from "rxjs/operators";
import {race, throwError, timer} from "rxjs";

import {Context} from "src/electron-main/model";
import {DEFAULT_API_CALL_TIMEOUT} from "src/shared/constants";
import {FOLDER_UTILS, buildFoldersAndRootNodePrototypes, fillFoldersAndReturnRootConversationNodes} from "./folders-view";
import {Folder, FsDb, FsDbAccount, IndexableMailId, Mail, View} from "src/shared/model/database";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {curryFunctionMembers, walkConversationNodesTree} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/search]");

export async function buildDbSearchEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "dbFullTextSearch">> {
    return {
        async dbFullTextSearch({type, login, query, folderPks}) {
            logger.info("dbFullTextSearch()");

            const timeoutMs = DEFAULT_API_CALL_TIMEOUT;
            const account = ctx.db.getAccount({type, login});

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

            return result$.toPromise();
        },
    };
}

export function searchRootConversationNodes<T extends keyof FsDb["accounts"]>(
    account: FsDbAccount<T>,
    {mailPks, folderPks}: { mailPks?: Array<Mail["pk"]>; folderPks?: Array<Folder["pk"]>; } = {},
): View.RootConversationNode[] {
    // TODO optimize search: implement custom search instead of getting all the mails first and then narrowing the list down
    // TODO don't create functions inside iterations so extensively, "filter" / "walkConversationNodesTree" calls
    const {rootNodePrototypes, folders} = buildFoldersAndRootNodePrototypes(account);
    const filteredByMails = mailPks
        ? rootNodePrototypes.filter((rootNodePrototype) => {
            let matched: boolean = false;
            // don't filter by folders here as folders are not yet linked to root nodes at this point
            walkConversationNodesTree([rootNodePrototype], ({mail}) => {
                matched = Boolean(mail && mailPks.includes(mail.pk));
                if (!matched) {
                    return;
                }
                return "break";
            });
            return matched;
        })
        : rootNodePrototypes;
    const filteredByMailsWithFoldersAttached = fillFoldersAndReturnRootConversationNodes(filteredByMails);

    const result = folderPks
        ? filteredByMailsWithFoldersAttached.filter((rootNodePrototype) => {
            let matched: boolean = false;
            walkConversationNodesTree([rootNodePrototype], ({mail}) => {
                matched = Boolean(mail && mail.folders.find(({pk}) => folderPks.includes(pk)));
                if (!matched) {
                    return;
                }
                return "break";
            });
            return matched;
        })
        : filteredByMailsWithFoldersAttached;

    // TODO use separate function to fill the system folders names
    FOLDER_UTILS.splitAndFormatAndFillSummaryFolders(folders);

    return result;
}
