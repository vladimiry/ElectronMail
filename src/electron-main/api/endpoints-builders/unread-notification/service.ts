import electronLog from "electron-log";
import {exec} from "child_process";
import {pick} from "remeda";
import {promisify} from "util";
import {shouldInterruptAfterDeadline} from "quickjs-emscripten";

import {AccountConfig} from "src/shared/model/account";
import {augmentRawMailWithFolders, resolveCachedQuickJSInstance} from "src/electron-main/api/util";
import {buildAccountFoldersResolver} from "src/electron-main/database/util";
import {curryFunctionMembers} from "src/shared/util";
import {FsDbAccount} from "src/shared/model/database";
import {ONE_SECOND_MS} from "src/shared/const";
import {QUICK_JS_EVAL_CODE_VARIABLE_NAME} from "src/electron-main/api/const";

const logger = curryFunctionMembers(electronLog, __filename);

const evalCodeTimeout = ONE_SECOND_MS * 10; // TODO make the "eval code" timeout configurable

const resolveAugmentedRawMailsSerialized = (account: DeepReadonly<FsDbAccount>): string => {
    const {resolveFolderById} = buildAccountFoldersResolver(account, true);
    const augmentedRawMails: Array<ReturnType<typeof augmentRawMailWithFolders>> = [];

    for (const mail of Object.values(account.mails)) {
        if (!mail.unread) {
            continue;
        }
        augmentedRawMails.push(augmentRawMailWithFolders(mail, resolveFolderById, true));
    }

    return JSON.stringify(
        JSON.stringify(augmentedRawMails),
    );
};

export const resolveUnreadNotificationMessage = async (
    account: DeepReadonly<FsDbAccount>,
    {login, title: alias}: Pick<AccountConfig, "login" | "title">,
    code: string,
): Promise<string> => {
    // TODO quickJS: chunk mails to portions and process them in reduce/batch mode
    // TODO TS: don't hardcode the typings
    const evalCode = `
        (() => {
            let ${QUICK_JS_EVAL_CODE_VARIABLE_NAME} = "_UNDEFINED_UNREAD_NOTIFICATION_";
            const formatNotificationContent = (fn) => {
                ${QUICK_JS_EVAL_CODE_VARIABLE_NAME} = fn(
                    {
                        login: ${JSON.stringify(login)},
                        alias: ${alias ? JSON.stringify(alias) : "undefined"},
                        mails: JSON.parse(${resolveAugmentedRawMailsSerialized(account)}),
                    }
                );
            }
            {
                ${code}
            }
            return String(${QUICK_JS_EVAL_CODE_VARIABLE_NAME});
        })()
    `;

    // TODO quickJS: improve performance (execute function on context with preset variables/functions)
    return (await resolveCachedQuickJSInstance()).evalCode(
        evalCode,
        {shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + evalCodeTimeout)},
    ) as string;
};

export const executeUnreadNotificationShellCommand = async (
    account: DeepReadonly<FsDbAccount>,
    {login, title: alias}: Pick<AccountConfig, "login" | "title">,
    code: string,
): Promise<void> => {
    // TODO quickJS: chunk mails to portions and process them in reduce/batch mode
    const evalCode = `
        (() => {
            let ${QUICK_JS_EVAL_CODE_VARIABLE_NAME};
            const formatNotificationShellExecArguments = (fn) => {
                ${QUICK_JS_EVAL_CODE_VARIABLE_NAME} = fn(
                    {
                        login: ${JSON.stringify(login)},
                        alias: ${alias ? JSON.stringify(alias) : "undefined"},
                        mails: JSON.parse(${resolveAugmentedRawMailsSerialized(account)}),
                        process: {
                            env: JSON.parse(${JSON.stringify(JSON.stringify(process.env))}),
                        },
                    }
                );
            }
            {
                ${code}
            }
            return ${QUICK_JS_EVAL_CODE_VARIABLE_NAME};
        })()
    `;

    // TODO quickJS: improve performance (execute function on context with preset variables/functions)
    const {command, options} = (await resolveCachedQuickJSInstance()).evalCode(
        evalCode,
        {shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + evalCodeTimeout)},
    ) as { command: string, options?: { cwd?: string, env?: Record<string, string> } };

    if (!command) {
        logger.verbose(nameof(executeUnreadNotificationShellCommand), `skipping empty "${nameof(command)}" execution`);
        return;
    }

    const execOptions: Parameters<typeof exec>[1] = {
        cwd: options?.cwd,
        env: options?.env,
    };

    try {
        await promisify(exec)(command, execOptions);
    } catch (error) {
        // we don't show/log a possibly sensitive data (like command to execute or its options), so the original error gets suppressed
        throw new Error(
            "Failed to execute a triggered by an unread desktop notification shell exec command: " +
            JSON.stringify(
                pick(Object(error) as unknown as { errno: unknown, code: unknown }, ["errno", "code"]),
            ),
        );
    }
};
