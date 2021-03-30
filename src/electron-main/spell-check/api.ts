import electronLog from "electron-log";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, __filename);

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "getSpellCheckMetadata" | "changeSpellCheckLocale" | "spellCheck">> {
    return {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async getSpellCheckMetadata() {
            return {
                locale: ctx.getSpellCheckController().getCurrentLocale(),
            };
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async changeSpellCheckLocale({locale}) {
            logger.info("selecting spellchecking language", locale);

            await ctx.getSpellCheckController().changeLocale(locale);

            setTimeout(async () => {
                const endpoints = await ctx.deferredEndpoints.promise;

                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.Locale(
                        await endpoints.getSpellCheckMetadata(),
                    ),
                );

                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.ConfigUpdated(
                        await ctx.configStoreQueue.q(
                            async () => {
                                return ctx.configStore.write({
                                    ...await ctx.configStore.readExisting(),
                                    spellCheckLocale: locale,
                                });
                            },
                        ),
                    ),
                );
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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
