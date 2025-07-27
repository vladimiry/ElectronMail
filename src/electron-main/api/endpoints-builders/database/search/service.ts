import type {QuickJSHandle} from "quickjs-emscripten";
import {shouldInterruptAfterDeadline} from "quickjs-emscripten";

import {augmentRawMailWithFolders, resolveCachedQuickJSInstance} from "src/electron-main/api/util";
import {Context} from "src/electron-main/model";
import {Folder, FsDbAccount, IndexableMailId, Mail, View} from "src/shared/model/database";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {ONE_MINUTE_MS, ONE_SECOND_MS} from "src/shared/const";
import {QUICK_JS_EVAL_CODE_VARIABLE_NAME} from "src/electron-main/api/const";
import * as searchService from "src/electron-main/api/endpoints-builders/database/folders-view";
import {walkConversationNodesTree} from "src/shared/util";

export function searchRootConversationNodes(
    account: DeepReadonly<FsDbAccount>,
    {mailPks, folderIds}: DeepReadonly<{mailPks?: Array<Mail["pk"]>; folderIds?: Array<Folder["pk"]>}> = {},
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
    {login, folderIds, hasAttachments, codeFilter, sentDateAfter}: DeepReadonly<
        Pick<
            Parameters<IpcMainApiEndpoints["dbFullTextSearch"]>[0],
            "login" | "folderIds" | "hasAttachments" | "sentDateAfter" | "codeFilter"
        >
    >,
    mailScoresByPk: ReadonlyMap<IndexableMailId, number> | null,
): Promise<Unpacked<ReturnType<IpcMainApiEndpoints["dbFullTextSearch"]>>["mailsBundleItems"]> => {
    const account = ctx.db.getAccount({login});

    if (!account) {
        throw new Error("Failed to resolve the account");
    }

    // TODO quickJS:
    //  - improve performance (execute function on context with preset variables/functions)
    //  - process mails in batch mode vs per-email function calling)
    const codeFilterService = codeFilter && await (async () => {
        const runtime = (await resolveCachedQuickJSInstance()).newRuntime();
        runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + ONE_SECOND_MS));
        const context = runtime.newContext();
        const stubName = `${QUICK_JS_EVAL_CODE_VARIABLE_NAME}__filter__`;
        {
            const stubNameFull = `globalThis.${stubName}`;
            const stubResult = context.evalCode(
                `
                ${stubNameFull} = undefined;
                function filterMessage(fn) {
                    ${stubNameFull} = fn;
                }
                `,
            );
            if (stubResult.error) throw new Error(`Failed to inject "${stubNameFull}" stub`);
            stubResult.dispose();
        }
        {
            const userResult = context.evalCode(codeFilter);
            if (userResult.error) throw new Error("User code failed");
            userResult.dispose();
        }
        const filterFnHandle = context.getProp(context.global, stubName);
        if (context.typeof(filterFnHandle) !== "function") {
            throw new Error("User code did not provide a valid filter function");
        }
        function injectValue(value: unknown): QuickJSHandle {
            if (value === null || value === undefined) return context.undefined;
            const type = typeof value;
            if (type === "string") return context.newString(value as string);
            if (type === "number") return context.newNumber(value as number);
            if (type === "boolean") return value ? context.true : context.false;
            if (Array.isArray(value)) {
                const arrHandle = context.newArray();
                for (let i = 0; i < value.length; i++) {
                    const itemHandle = injectValue(value[i]);
                    context.setProp(arrHandle, i, itemHandle);
                    itemHandle.dispose();
                }
                return arrHandle;
            }
            if (type === "object") {
                const objHandle = context.newObject();
                for (const [key, val] of Object.entries(value)) {
                    const valHandle = injectValue(val);
                    context.setProp(objHandle, key, valHandle);
                    valHandle.dispose();
                }
                return objHandle;
            }
            return context.newString(String(value));
        }
        runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + ONE_MINUTE_MS * 10));
        return {
            filter(mail: ReturnType<typeof augmentRawMailWithFolders>): boolean {
                const mailHandle = injectValue(mail);
                const resultHandle = context.callFunction(filterFnHandle, context.undefined, mailHandle);
                mailHandle.dispose();
                if (resultHandle.error) {
                    const errorHandle = resultHandle.error;
                    const messageHandle = context.getProp(errorHandle, "message");
                    const stackHandle = context.getProp(errorHandle, "stack");
                    const message = context.dump(messageHandle); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                    const stack = context.dump(stackHandle); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                    // eslint-disable-next-line no-console
                    console.error(__filename, `"${nameof(codeFilter)}" execution error message:`, message);
                    // eslint-disable-next-line no-console
                    console.error(__filename, `"${nameof(codeFilter)}" execution error stack trace:`, stack);
                    messageHandle.dispose();
                    stackHandle.dispose();
                    errorHandle.dispose();
                    throw new Error(`Code filter execution failed: ${message}`);
                }
                const result = context.dump(resultHandle.value); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                resultHandle.dispose();
                return result; // eslint-disable-line @typescript-eslint/no-unsafe-return
            },
            dispose() {
                filterFnHandle.dispose();
                context.dispose();
                runtime.dispose();
            },
        };
    })();

    const filters = {
        byFolder: folderIds
            ? ({id}: View.Folder): boolean => folderIds.includes(id)
            : () => true,
        byHasAttachment: hasAttachments
            ? (attachmentsCount: number): boolean => Boolean(attachmentsCount)
            : () => true,
        byCode: codeFilterService
            ? ({pk, folders}: View.Mail): boolean => {
                const mail = account.mails[pk];
                if (typeof mail === "undefined") {
                    throw new Error(`Failed to resolve ${nameof(mail)}`);
                }
                // const augmentedRawMailSerialized = JSON.stringify(JSON.stringify(augmentRawMailWithFolders(mail, folders, false)));
                return codeFilterService.filter(augmentRawMailWithFolders(mail, folders, false));
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
    const getScore: (mail: Exclude<View.ConversationNode["mail"], undefined>) => number | undefined | null = mailScoresByPk
        ? ({pk}) => mailScoresByPk.get(pk)
        : () => null; // no full-text search executing happened, so no score provided
    const rootConversationNodes = searchRootConversationNodes(account, {
        mailPks: mailScoresByPk
            ? [...mailScoresByPk.keys()]
            : undefined,
        folderIds,
    }, true);
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
                (score === null // no full-text search executing happened, so accept all mails in this filter
                    || typeof score === "number")
                && mail.folders.find(filters.byFolder)
                && filters.byHasAttachment(mail.attachmentsCount)
                && filters.bySentDateAfter(mail.sentDate)
                && filters.byCode(mail)
            ) {
                matchedScoredNodeMails.push({...mail, score: score ?? undefined});
            }
        });

        if (!matchedScoredNodeMails.length) {
            continue;
        }

        mailsBundleItems.push(...matchedScoredNodeMails.map((mail) => ({mail, conversationSize: allNodeMailsCount})));
    }

    if (codeFilterService) codeFilterService.dispose();

    return mailsBundleItems;
};
