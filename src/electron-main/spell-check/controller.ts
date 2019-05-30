import {Controller, FuzzyLocale, Provider} from "./model";
import {Locale} from "src/shared/types";
import {constructDummyProvider, constructProvider} from "./providers";

const dummyProvider = constructDummyProvider();

async function provider(locale: Locale) {
    const spellCheckerModule = await import("spellchecker");
    const setupModule = await import("./setup");
    const {getLocation} = await setupModule.setup();
    const spellchecker = new spellCheckerModule.Spellchecker();

    spellchecker.setDictionary(locale, getLocation());

    return constructProvider(locale, spellchecker);
}

async function narrowFuzzyLocaleToStateValue(
    locale: FuzzyLocale,
): Promise<ReturnType<Controller["getCurrentLocale"]>> {
    const setupModule = await import("./setup");
    return locale === true
        ? await setupModule.resolveSystemLocale()
        : locale;
}

export async function initSpellCheckController(
    initialLocale: FuzzyLocale,
): Promise<Controller> {
    const state: {
        provider: Readonly<Provider>;
        currentLocale: ReturnType<Controller["getCurrentLocale"]>;
    } = {
        provider: dummyProvider,
        currentLocale: await narrowFuzzyLocaleToStateValue(initialLocale),
    };
    const controller: Controller = {
        async changeLocale(newLocale) {
            state.currentLocale = await narrowFuzzyLocaleToStateValue(newLocale);

            if (state.currentLocale === false) {
                state.provider = dummyProvider;
                return;
            }

            state.provider = await provider(state.currentLocale);
        },
        getSpellCheckProvider() {
            return state.provider;
        },
        getCurrentLocale() {
            return state.currentLocale;
        },
        async getAvailableDictionaries() {
            const setupModule = await import("./setup");
            const setup = await setupModule.setup();
            return setup.getAvailableDictionaries();
        },
    };

    if (typeof state.currentLocale === "string") {
        // we only construct the provider by calling "changeLocale" if spell checking is enabled
        // to prevent potential app crush even though the spell checking feature is disabled
        await controller.changeLocale(state.currentLocale);
    }

    return controller;
}
