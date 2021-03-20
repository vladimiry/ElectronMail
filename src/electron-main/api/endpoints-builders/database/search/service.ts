import {QuickJS, getQuickJS, shouldInterruptAfterDeadline} from "quickjs-emscripten";

import {Context} from "src/electron-main/model";
import {Folder, FsDbAccount, IndexableMailId, LABEL_TYPE, Mail, View} from "src/shared/model/database";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {
    buildFoldersAndRootNodePrototypes,
    fillFoldersAndReturnRootConversationNodes,
    splitAndFormatAndFillSummaryFolders,
} from "src/electron-main/api/endpoints-builders/database/folders-view";
import {walkConversationNodesTree} from "src/shared/util";

export function searchRootConversationNodes(
    account: DeepReadonly<FsDbAccount>,
    {mailPks, folderIds}: DeepReadonly<{ mailPks?: Array<Mail["pk"]>; folderIds?: Array<Folder["pk"]> }> = {},
): View.RootConversationNode[] {
    // TODO optimize search: implement custom search instead of getting all the mails first and then narrowing the list down
    // TODO don't create functions inside iterations so extensively, "filter" / "walkConversationNodesTree" calls
    const {rootNodePrototypes, folders} = buildFoldersAndRootNodePrototypes(account);
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
    const filteredByMailsWithFoldersAttached = fillFoldersAndReturnRootConversationNodes(filteredByMails);

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
    splitAndFormatAndFillSummaryFolders(folders);

    return result;
}

const formFoldersForQuickJSEvaluation = (
    folders: DeepReadonly<Array<View.Folder>>,
    type: Unpacked<typeof LABEL_TYPE._.values>,
): Array<{ Id: string, Name: string, Unread: number, Size: number }> => {
    return folders
        .filter((folder) => folder.type === type)
        .map(({id, name, unread, size}) => ({Id: id, Name: name, Unread: unread, Size: size}));
};

const resolveQuickJS: () => Promise<QuickJS> = (() => {
    let getQuickJSPromise: ReturnType<typeof getQuickJS> | undefined;
    return async () => getQuickJSPromise ??= getQuickJS();
})();

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

    const quickJS = await resolveQuickJS();
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
                    throw new Error("Failed to resolve mail.");
                }
                const serializedMailCodePart = JSON.stringify(
                    JSON.stringify({
                        ...JSON.parse(mail.raw),
                        Body: mail.body,
                        ...(mail.failedDownload && {_BodyDecryptionFailed : true}),
                        Folders: formFoldersForQuickJSEvaluation(folders, LABEL_TYPE.MESSAGE_FOLDER),
                        Labels: formFoldersForQuickJSEvaluation(folders, LABEL_TYPE.MESSAGE_LABEL),
                    }),
                );
                return quickJS.evalCode(`
                    (() => {
                        let _result_ = false;
                        function filterMessage(filter) {
                            _result_ = filter(
                                JSON.parse(${serializedMailCodePart}),
                            );
                        }
                        {
                            ${codeFilter}
                        }
                        return Boolean(_result_);
                    })()
                    `,
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
