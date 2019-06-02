import _logger from "electron-log";
import os from "os";
import path from "path";
import semver from "semver";
import {inspect} from "util";

import {Locale} from "src/shared/types";
import {curryFunctionMembers, normalizeLocale, removeDuplicateItems} from "src/shared/util";

export let resolveDefaultLocale: () => Promise<Locale> = async () => {
    const logger = curryFunctionMembers(_logger, "[src/electron-main/spell-check/setup] resolveDefaultLocale()");
    const resolvedLocale: Locale | undefined = await (async () => {
        const osLocaleModule = await import("os-locale");
        const {getAvailableDictionaries} = await setup();
        const dictionaries = getAvailableDictionaries();

        // hunspell requires the fully-qualified result
        // so load local with help of "os-result" module
        // since it returns result in "es_ES" format vs "es." returned by "os" module
        const locale = normalizeLocale(
            await osLocaleModule.default(),
        ) as Locale | undefined;
        logger.info(`Resolved OS locale: ${locale}`);

        if (!locale || !["en_us", "en"].includes(locale.toLowerCase())) {
            // priority order: en_US, en, en_*
            const preferredDictionaryLocale = (
                dictionaries.find((dictionary) => dictionary.toLowerCase() === "en_us")
                ||
                dictionaries.find((dictionary) => dictionary.toLowerCase() === "en")
                ||
                dictionaries.find((dictionary) => dictionary.toLowerCase().startsWith("en_"))
            );
            if (preferredDictionaryLocale) {
                logger.info(`"${preferredDictionaryLocale}" locale got preferred over "${locale}"`);
                // it's already narrowed to available dictionary
                return preferredDictionaryLocale;
            }
        }

        // narrow to available dictionary
        if (locale) {
            const lowerCaseLocale = locale.toLowerCase();
            const localeIsInDictionary = dictionaries.some((dictionary) => dictionary.toLowerCase() === lowerCaseLocale);

            if (localeIsInDictionary) {
                return locale;
            }

            logger.info(`"${locale}" is not in the dictionary`);

            if (!dictionaries.length) {
                logger.info(`Dictionary is empty so returning "undefined"`);
                return undefined;
            }

            // priority order: ${lowerCaseLocale}*, first item
            const dictionaryLocale = (
                dictionaries.find((dictionary) => dictionary.toLowerCase().startsWith(lowerCaseLocale))
                ||
                dictionaries.find(Boolean)
            );
            logger.info(`"${dictionaryLocale}" locale got picked from the dictionary`);
            return dictionaryLocale;
        }

        return locale;
    })();

    const defaultLocale: Locale = (
        resolvedLocale
        ||
        (() => {
            const fallbackLocale = "en_US";
            logger.info(`Failed to resolve locale so falling back to "${fallbackLocale}"`);
            return fallbackLocale;
        })()
    );

    // the LANG environment variable is how node spellchecker finds its default language:
    // https://github.com/atom/node-spellchecker/blob/59d2d5eee5785c4b34e9669cd5d987181d17c098/lib/spellchecker.js#L29
    if (!process.env.LANG) {
        process.env.LANG = defaultLocale;
    }

    // memoize the result
    resolveDefaultLocale = async () => defaultLocale;

    logger.info(`Detected system/default locale: ${defaultLocale}`);

    return defaultLocale;
};

export let setup: () => Promise<{
    getLocation: () => string | undefined;
    getAvailableDictionaries: () => readonly Locale[];
}> = async () => {
    const logger = curryFunctionMembers(_logger, "[src/electron-main/spell-check/setup] setup()");
    const state: {
        location: string | undefined;
        hunspellLocales: Locale[];
    } = {
        hunspellLocales: [],
        location: process.env.HUNSPELL_DICTIONARIES,
    };
    const platform = os.platform();

    logger.verbose("Initial state", inspect({state}));

    if (platform === "linux") {
        await (async () => {
            const fastGlobModule = await import("fast-glob");

            // apt-get install hunspell-<locale> can be run for easy access to other dictionaries
            state.location = state.location || "/usr/share/hunspell";

            const hunspellDictionariesGlob = path.join(state.location, "*.dic");
            logger.verbose(inspect({dictionaryFilesGlobPattern: hunspellDictionariesGlob}));

            // hunspell"s "getAvailableDictionaries" does nothing, so use glob resolving as a workaround
            const hunspellDictionaries = await fastGlobModule.async<string>(
                hunspellDictionariesGlob,
                {
                    absolute: true,
                    deep: 1,
                    onlyFiles: true,
                    stats: false,
                },
            );
            logger.verbose(inspect({hunspellDictionaries}));

            const hunspellLocales = hunspellDictionaries.map((dictionaryFile) => {
                return normalizeLocale(
                    path.basename(
                        dictionaryFile,
                        path.extname(dictionaryFile),
                    ),
                );
            });
            logger.verbose(inspect({hunspellLocales}));

            logger.info("Found hunspell dictionaries", hunspellLocales);
            state.hunspellLocales.push(...hunspellLocales);

            logger.info(`Detected Linux. Dictionary location: ${state.location}`);
        })();
    } else if (platform === "win32" && semver.lt(os.release(), "8.0.0")) {
        logger.info(`Detected Windows 7 or below. Dictionary location: ${state.location}`);
    } else {
        // OSX and Windows 8+ have OS-level spellcheck APIs
        logger.info(`Detected OSX/Windows 8+. Using OS-level spell check API`);
    }

    const spellCheckerModule = await import("spellchecker");
    const spellCheckerDictionaries = spellCheckerModule.getAvailableDictionaries();
    logger.verbose(inspect({spellCheckerDictionaries}));

    const availableDictionaries: readonly Locale[] = removeDuplicateItems(
        [
            ...spellCheckerDictionaries,
            // this needs to be called after OS-dependent initialization got completed (see above code lines), ie "state" got settled down
            ...state.hunspellLocales,
        ].map(normalizeLocale),
    );
    logger.verbose(inspect({availableDictionaries}));

    const result = {
        getLocation() {
            return state.location;
        },
        getAvailableDictionaries() {
            return availableDictionaries;
        },
    };

    // memoize the result
    setup = async () => result;

    return result;
};
