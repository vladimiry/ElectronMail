import electronLog from "electron-log";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/spell-check/api]");

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "getSpellCheckMetadata" | "changeSpellCheckLocale" | "spellCheck">> {
    return {
        async getSpellCheckMetadata() {
            return {
                locale: ctx.getSpellCheckController().getCurrentLocale(),
            };
        },

        async changeSpellCheckLocale({locale}) {
            logger.info("selecting spellchecking language", locale);

            await ctx.getSpellCheckController().changeLocale(locale);

            setTimeout(async () => {
                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.Locale({
                        // TODO consider getting data from "getSpellCheckMetadata" endpoint response
                        locale: ctx.getSpellCheckController().getCurrentLocale(),
                    }),
                );
                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.Config(
                        {
                            config: await ctx.configStore.write({
                                ...await ctx.configStore.readExisting(),
                                spellCheckLocale: locale,
                            }),
                        },
                    ),
                );
            });
        },

        async spellCheck({words}) {
            const misspelledWords: string[] = await new Promise((resolve) => {
                ctx.getSpellCheckController()
                    .getSpellCheckProvider()
                    .spellCheck(words, resolve);
            });

            return {misspelledWords};
        },
    };
}
