import {Spellchecker, getAvailableDictionaries} from "spellchecker";

import * as setup from "./setup";
import {FuzzyLocale, Provider} from "./model";
import {Locale} from "src/shared/types";
import {constructCompositeProvider, constructDummyProvider, constructProvider} from "./providers";
import {removeDuplicateItems} from "src/shared/util";

const dictionaries: readonly Locale[] = removeDuplicateItems([
    ...getAvailableDictionaries(),
    ...setup.getExtraLocales(),
]);

const dummyProvider = constructDummyProvider();

export function constructSpellCheckController(): {
    getSpellCheckProvider(): Readonly<Provider>;

    getCurrentLocale(): FuzzyLocale;

    getAvailableDictionaries(): readonly Locale[];

    changeLocale(locale: FuzzyLocale): void;
} {
    const state: {
        provider: Readonly<Provider>;
        currentLocale: FuzzyLocale;
    } = {
        provider: dummyProvider,
        currentLocale: setup.DEFAULT_LOCALE,
    };
    const location = setup.getLocation();
    const controller: ReturnType<typeof constructSpellCheckController> = {
        changeLocale(_) {
            state.currentLocale = _;

            if (state.currentLocale === null) {
                state.provider = dummyProvider;
                return;
            }

            if (state.currentLocale === true) {
                const locale = setup.DEFAULT_LOCALE;
                state.currentLocale = locale;
                state.provider = provider(locale);
                return;
            }

            if (state.currentLocale === "*") {
                state.provider = dictionaries.length
                    ? (
                        dictionaries.length === 1
                            ? provider(dictionaries[0])
                            : compositeProvider(dictionaries)
                    )
                    : (
                        provider(setup.DEFAULT_LOCALE)
                    );
                return;
            }

            state.provider = provider(state.currentLocale);
        },
        getSpellCheckProvider() {
            return state.provider;
        },
        getCurrentLocale() {
            return state.currentLocale;
        },
        getAvailableDictionaries() {
            return dictionaries;
        },
    };

    controller.changeLocale(state.currentLocale);

    return controller;

    function provider(locale: Locale) {
        const spellchecker = new Spellchecker();
        spellchecker.setDictionary(locale, location);
        return constructProvider(locale, spellchecker);
    }

    function compositeProvider(locales: readonly Locale[]) {
        return constructCompositeProvider(
            locales.map(provider),
        );
    }
}
