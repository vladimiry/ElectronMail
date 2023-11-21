import {shouldInterruptAfterDeadline} from "quickjs-emscripten";

import {augmentRawMailWithFolders, resolveCachedQuickJSInstance} from "src/electron-main/api/util";
import {Context} from "src/electron-main/model";
import {Folder, FsDbAccount, IndexableMailId, Mail, View} from "src/shared/model/database";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {ONE_SECOND_MS} from "src/shared/const";
import {QUICK_JS_EVAL_CODE_VARIABLE_NAME} from "src/electron-main/api/const";
import * as searchService from "src/electron-main/api/endpoints-builders/database/folders-view";
import {walkConversationNodesTree} from "src/shared/util";

export function searchRootConversationNodes(
    account: DeepReadonly<FsDbAccount>,
    {mailPks, folderIds}: DeepReadonly<{ mailPks?: Array<Mail["pk"]>; folderIds?: Array<Folder["pk"]> }> = {},
    includingSpam: boolean,
): View.RootConversationNode[] {
    // TODO optimize search: implement custom search instead of getting all the mails first and then narrowing the list down
    // TODO don't create functions inside iterations so extensively, "filter" / "walkConversationNodesTree" calls
    const {rootNodePrototypes, folders} = searchService.buildFoldersAndRootNodePrototypes(account, includingSpam);
    const filteredByMails = mailPks
        ? rootNodePrototypes.filter((rootNodePrototype) => {
            let matched = false;
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
    const filteredByMailsWithFoldersAttached = searchService.fillFoldersAndReturnRootConversationNodes(filteredByMails);

    const result = folderIds
        ? filteredByMailsWithFoldersAttached.filter((rootNodePrototype) => {
            let matched = false;
            walkConversationNodesTree([rootNodePrototype], ({mail}) => {
                matched = Boolean(mail && mail.folders.find(({id}) => folderIds.includes(id)));
                if (!matched) {
                    return;
                }
                return "break";
            });
            return matched;
        })
        : filteredByMailsWithFoldersAttached;

    // TODO use separate function to fill the system folders names
    searchService.splitAndFormatAndFillSummaryFolders(folders);

    return result;
}

export const secondSearchStep = async (
    ctx: DeepReadonly<Context>,
    {login, folderIds, hasAttachments, codeFilter, sentDateAfter}:
        DeepReadonly<Pick<Parameters<IpcMainApiEndpoints["dbFullTextSearch"]>[0],
            "login" | "folderIds" | "hasAttachments" | "sentDateAfter" | "codeFilter">>,
    mailScoresByPk: ReadonlyMap<IndexableMailId, number> | null,
): Promise<Unpacked<ReturnType<IpcMainApiEndpoints["dbFullTextSearch"]>>["mailsBundleItems"]> => {
    const account = ctx.db.getAccount({login});

    if (!account) {
        throw new Error("Failed to resolve the account");
    }

    // TODO quickJS:
    //  - improve performance (execute function on context with preset variables/functions)
    //  - process mails in batch mode vs per-email function calling)
    const quickJS = codeFilter && await resolveCachedQuickJSInstance();
    const filters = {
        byFolder: folderIds
            ? ({id}: View.Folder): boolean => folderIds.includes(id)
            : () => true,
        byHasAttachment: hasAttachments
            ? (attachmentsCount: number): boolean => Boolean(attachmentsCount)
            : () => true,
        byCode: codeFilter
            ? ({pk, folders}: View.Mail): boolean => {
                const mail = account.mails[pk];
                if (typeof mail === "undefined") {
                    throw new Error(`Failed to resolve ${nameof(mail)}`);
                }
                if (!quickJS) {
                    throw new Error(`"${nameof(quickJS)}" has not been initialized`);
                }
                const augmentedRawMailSerialized = JSON.stringify(
                    JSON.stringify(
                        augmentRawMailWithFolders(mail, folders, false),
                    ),
                );
                const evalCode = `
                    (() => {
                        let ${QUICK_JS_EVAL_CODE_VARIABLE_NAME} = false;
                        const filterMessage = (fn) => {
                            ${QUICK_JS_EVAL_CODE_VARIABLE_NAME} = fn(
                                JSON.parse(${augmentedRawMailSerialized}),
                            );
                        };
                        {
                            ${codeFilter}
                        }
                        return Boolean(${QUICK_JS_EVAL_CODE_VARIABLE_NAME});
                    })()
                `;
                return quickJS.evalCode(
                    evalCode,
                    {shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + ONE_SECOND_MS)},
                ) as boolean;
            }
            : () => true,
        bySentDateAfter: (() => {
            const sentDateAfterFilterValue: number | null = sentDateAfter
                ? new Date(String(sentDateAfter).trim()).getTime()
                : null;
            return sentDateAfterFilterValue
                ? (sentDate: number): boolean => sentDate > sentDateAfterFilterValue
                : () => true;
        })(),
    } as const;
    const getScore: (mail: Exclude<View.ConversationNode["mail"], undefined>) => number | undefined | null
        = mailScoresByPk
        ? ({pk}) => mailScoresByPk.get(pk)
        : () => null; // no full-text search executing happened, so no score provided
    const rootConversationNodes = searchRootConversationNodes(
        account,
        {
            mailPks: mailScoresByPk
                ? [...mailScoresByPk.keys()]
                : undefined,
            folderIds,
        },
        true,
    );
    const mailsBundleItems: Unpacked<ReturnType<typeof secondSearchStep>> = [];

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
                mail.folders.find(filters.byFolder)
                &&
                filters.byHasAttachment(mail.attachmentsCount)
                &&
                filters.bySentDateAfter(mail.sentDate)
                &&
                filters.byCode(mail)
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

    return mailsBundleItems;
};
