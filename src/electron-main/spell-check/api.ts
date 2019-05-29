import {DEFAULT_LOCALE} from "src/electron-main/spell-check/setup";
import {FuzzyLocale} from "src/electron-main/spell-check/model";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {Locale} from "src/shared/types";
import {SPELL_CHECK_CONTROLLER} from "src/electron-main/spell-check/constants";

export async function buildEndpoints(): Promise<Pick<IpcMainApiEndpoints, "getSpellCheckMetadata" | "spellCheck">> {
    return {
        async getSpellCheckMetadata() {
            const fuzzyLocale: FuzzyLocale = SPELL_CHECK_CONTROLLER.getCurrentLocale();
            const locale: Locale = fuzzyLocale !== null && fuzzyLocale !== true && fuzzyLocale !== "*"
                ? fuzzyLocale
                : DEFAULT_LOCALE;

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
