import _logger from "electron-log";
import os from "os";
import path from "path";
import semver from "semver";

import {Locale} from "src/shared/types";
import {curryFunctionMembers, normalizeLocale, removeDuplicateItems} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/spell-check/setup]");

export let resolveSystemLocale: () => Promise<Locale> = async () => {
    const osLocaleModule = await import("os-locale");

    // hunspell requires the fully-qualified locale
    // so load local with help of "os-locale" module as it returns locale in "es_ES" format vs "es." returned by "os" module
    let result: Locale = normalizeLocale(osLocaleModule.sync()) || "en_US";

    // prefer "en_US" locale if OS locale is in "en"-group and respective dictionary available
    if (!result.toLowerCase().startsWith("en_us")) {
        const {getAvailableDictionaries} = await setup();
        const dictionaries = getAvailableDictionaries();
        const preferredLocale = (
            dictionaries.find((value) => value.toLowerCase() === "en_us")
            ||
            dictionaries.find((value) => value.toLowerCase().startsWith("en_us"))
        );
        if (preferredLocale) {
            logger.info(`"${preferredLocale}" locale got preferred over "${result}"`);
            result = preferredLocale;
        }
    }

    // the LANG environment variable is how node spellchecker finds its default language:
    // https://github.com/atom/node-spellchecker/blob/59d2d5eee5785c4b34e9669cd5d987181d17c098/lib/spellchecker.js#L29
    if (!process.env.LANG) {
        process.env.LANG = result;
    }

    // memoize the result
    resolveSystemLocale = async () => result;

    logger.info(`Detected system/default locale: ${result}`);

    return result;
};

export let setup: () => Promise<{
    getLocation: () => string | undefined;
    getAvailableDictionaries: () => readonly Locale[];
}> = async () => {
    const state: {
        location: string | undefined;
        hunspellLocales: Locale[];
    } = {
        hunspellLocales: [],
        location: process.env.HUNSPELL_DICTIONARIES,
    };
    const platform = os.platform();

    logger.verbose("Initial state", JSON.stringify({state}));

    if (platform === "linux") {
        await (async () => {
            const fastGlobModule = await import("fast-glob");

            // apt-get install hunspell-<locale> can be run for easy access to other dictionaries
            state.location = state.location || "/usr/share/hunspell";

            const hunspellDictionariesGlob = path.join(state.location, "*.dic");
            logger.verbose(JSON.stringify({dictionaryFilesGlobPattern: hunspellDictionariesGlob}));

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
            logger.verbose(JSON.stringify({hunspellDictionaries}));

            const hunspellLocales = hunspellDictionaries.map((dictionaryFile) => {
                return normalizeLocale(
                    path.basename(
                        dictionaryFile,
                        path.extname(dictionaryFile),
                    ),
                );
            });
            logger.verbose(JSON.stringify({hunspellLocales}));

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
    logger.verbose(JSON.stringify({spellCheckerDictionaries}));

    const availableDictionaries: readonly Locale[] = removeDuplicateItems(
        [
            ...spellCheckerDictionaries,
            // this needs to be called after OS-dependent initialization got completed (see above code lines), ie "state" got settled down
            ...state.hunspellLocales,
        ].map(normalizeLocale),
    );
    logger.verbose(JSON.stringify({availableDictionaries}));

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
