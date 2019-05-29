import _logger from "electron-log";
import fastGlob from "fast-glob";
import os from "os";
import osLocale from "os-locale";
import path from "path";
import semver from "semver";

import {Locale} from "src/shared/types";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/spell-check/setup]");

// hunspell requires the fully-qualified locale
// so load local with help of "os-locale" module as it returns locale in "es_ES" format vs "es." returned by "os" module
export const DEFAULT_LOCALE: Locale = osLocale
    .sync()
    .replace("-", "_");

// the LANG environment variable is how node spellchecker finds its default language:
// https://github.com/atom/node-spellchecker/blob/59d2d5eee5785c4b34e9669cd5d987181d17c098/lib/spellchecker.js#L29
if (!process.env.LANG) {
    process.env.LANG = DEFAULT_LOCALE;
}

const state: {
    location: string | undefined;
    extraLocales: Locale[];
} = {
    extraLocales: [],
    location: process.env.HUNSPELL_DICTIONARIES,
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

const platform = os.platform();

if (platform === "linux") {
    setupLinux(DEFAULT_LOCALE);
} else if (platform === "win32" && semver.lt(os.release(), "8.0.0")) {
    setupWin7AndEarlier(DEFAULT_LOCALE);
} else {
    // OSX and Windows 8+ have OS-level spellcheck APIs
    logger.info("Using OS-level spell check API with locale", DEFAULT_LOCALE);
}

export function getExtraLocales(): readonly Locale[] {
    return state.extraLocales;
}

export function getLocation(): typeof state.location {
    return state.location;
}
