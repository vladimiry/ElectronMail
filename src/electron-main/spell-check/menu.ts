import {MenuItemConstructorOptions, WebContents} from "electron";

import {FuzzyLocale} from "./model";
import {Locale} from "src/shared/types";

export function buildSpellingSuggestionMenuItems(
    webContents: Readonly<WebContents>,
    misspelled: boolean,
    suggestions: readonly string[],
): MenuItemConstructorOptions[] {
    return misspelled && suggestions.length
        ? [
            ...suggestions.map((suggestion) => {
                return {
                    label: suggestion,
                    click: replaceWithSuggestion(webContents, suggestion),
                };
            }),
            {type: "separator"},
        ]
        : [];
}

export function buildSpellCheckSettingsMenuItems(
    detectedLocales: readonly Locale[],
    currentLocale: FuzzyLocale,
    onChangeLocale: (locale: FuzzyLocale) => void,
): MenuItemConstructorOptions[] {
    const enabled = currentLocale !== null;
    const submenu: MenuItemConstructorOptions[] = [
        ...detectedLocales.map((detectedLocale) => {
            return {
                label: detectedLocale,
                type: "radio",
                enabled,
                checked: detectedLocale === currentLocale,
                click() {
                    onChangeLocale(detectedLocale);
                },
            } as const;
        }),
        {
            label: "All your languages",
            type: "radio",
            enabled,
            checked: currentLocale === "*",
            click() {
                onChangeLocale("*");
            },
        },
        {type: "separator"},
        {
            label: "Enabled",
            type: "checkbox",
            checked: enabled,
            enabled: Boolean(detectedLocales.length),
            click() {
                onChangeLocale(enabled ? null : true);
            },
        },
    ];

    return [
        {
            label: "Spell check settings",
            submenu,
        },
    ];
}

function replaceWithSuggestion(webContents: WebContents, suggestion: string): () => void {
    return () => {
        webContents.replaceMisspelling(suggestion);
    };
}
