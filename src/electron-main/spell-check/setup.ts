import _logger from "electron-log";
import fastGlob from "fast-glob";
import os from "os";
import path from "path";
import semver from "semver";

import {Locale} from "src/shared/types";
import {curryFunctionMembers, removeDuplicateItems} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/spell-check/setup]");

const state: {
    location: string | undefined;
    extraLocales: Locale[];
} = {
    extraLocales: [],
    location: process.env.HUNSPELL_DICTIONARIES,
};

export let resolveSystemLocale: () => Promise<Locale> = async () => {
    const osLocaleModule = await import("os-locale");

    // hunspell requires the fully-qualified locale
    // so load local with help of "os-locale" module as it returns locale in "es_ES" format vs "es." returned by "os" module
    const result: Locale = osLocaleModule
        .sync()
        .replace("-", "_");

    // the LANG environment variable is how node spellchecker finds its default language:
    // https://github.com/atom/node-spellchecker/blob/59d2d5eee5785c4b34e9669cd5d987181d17c098/lib/spellchecker.js#L29
    if (!process.env.LANG) {
        process.env.LANG = result;
    }

    // memoize the result
    resolveSystemLocale = async () => result;

    return result;
};

export let setup: () => Promise<{
    getLocation: () => typeof state.location;
    getAvailableDictionaries: () => readonly Locale[];
}> = async () => {
    const platform = os.platform();
    const systemLocale = await resolveSystemLocale();

    if (platform === "linux") {
        setupLinux(systemLocale);
    } else if (platform === "win32" && semver.lt(os.release(), "8.0.0")) {
        setupWin7AndEarlier(systemLocale);
    } else {
        // OSX and Windows 8+ have OS-level spellcheck APIs
        logger.info("Using OS-level spell check API with locale", systemLocale);
    }

    const spellCheckerModule = await import("spellchecker");
    const availableDictionaries: readonly Locale[] = removeDuplicateItems([
        ...spellCheckerModule.getAvailableDictionaries(),
        ...state.extraLocales,
    ]);
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

function setupLinux(locale: Locale) {
    // apt-get install hunspell-<locale> can be run for easy access to other dictionaries
    state.location = state.location || "/usr/share/hunspell";

    // hunspell"s "getAvailableDictionaries" does nothing, so use glob resolving as a workaround
    const dictionaryFiles = fastGlob.sync<string>(
        // result is array of strings is "stats" option disabled (default behaviour)
        path.join(state.location, "*.dic"),
    );
    const locales = dictionaryFiles.map((dictionaryFile) => {
        return path.basename(dictionaryFile)
            .replace(".dic", "")
            .replace("-", "_");
    });

    logger.info("Found hunspell dictionaries", locales);
    state.extraLocales.push(...locales);

    if (process.env.HUNSPELL_DICTIONARIES || locale !== "en_US") {
        logger.info(
            "Detected Linux. Setting up spell check with locale",
            locale,
            "and dictionary location",
            location,
        );
    } else {
        logger.info(
            "Detected Linux. Using default en_US spell check dictionary",
        );
    }
}

function setupWin7AndEarlier(locale: Locale) {
    if (state.location || locale !== "en_US") {
        logger.info(
            "Detected Windows 7 or below. Setting up spell-check with locale",
            locale,
            "and dictionary location",
            state.location,
        );
    } else {
        logger.info(
            "Detected Windows 7 or below. Using default en_US spell check dictionary",
        );
    }
}
