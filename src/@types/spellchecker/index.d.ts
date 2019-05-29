import * as Upstream from "spellchecker";

// TODO drop "src/@types/spellchecker" when "@types/spellchecker" gets complete declarations support
declare module "spellchecker" {
    export class Spellchecker {
        add: typeof Upstream.add;
        getCorrectionsForMisspelling: typeof Upstream.getCorrectionsForMisspelling;
        isMisspelled: typeof Upstream.isMisspelled;
        setDictionary: typeof setDictionary;
    }

    // TODO consider not using a raw string type but deriving locale items from:
    //      - https://electronjs.org/docs/api/locales
    //      - @types/chrome-apps:chrome.i18n.kLanguageInfoTable
    export function getAvailableDictionaries(): string[];

    export function setDictionary(lang: string, dictPath: string | undefined): boolean;
}
