import {FuzzyLocale} from "src/electron-main/spell-check/model";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {Locale} from "src/shared/types";
import {SPELL_CHECK_CONTROLLER} from "src/electron-main/spell-check/constants";
import {SYSTEM_LOCALE} from "src/electron-main/spell-check/setup";

export async function buildEndpoints(): Promise<Pick<IpcMainApiEndpoints, "getSpellCheckMetadata" | "spellCheck">> {
    return {
        async getSpellCheckMetadata() {
            const fuzzyLocale: FuzzyLocale = SPELL_CHECK_CONTROLLER.getCurrentLocale();
            const locale: Locale = typeof fuzzyLocale !== "boolean"
                ? fuzzyLocale
                : SYSTEM_LOCALE;

            return {locale};
        },

        async spellCheck({words}) {
            const misspelledWords: string[] = await new Promise((resolve) => {
                SPELL_CHECK_CONTROLLER
                    .getSpellCheckProvider()
                    .spellCheck(words, resolve);
            });

            return {misspelledWords};
        },
    };
}
