import {MenuItemConstructorOptions, WebContents} from "electron";

import {FuzzyLocale} from "./model";
import {Locale} from "src/shared/types";

export function buildSpellingSuggestionMenuItems(
    webContents: Readonly<WebContents>,
    suggestions: readonly string[],
): MenuItemConstructorOptions[] {
    return suggestions.map((suggestion) => {
        return {
            label: suggestion,
            click: () => {
                webContents.replaceMisspelling(suggestion);
            },
        };
    });
}

export function buildSpellCheckSettingsMenuItems(
    detectedLocales: readonly Locale[],
    currentLocale: FuzzyLocale,
    onChangeLocale: (locale: FuzzyLocale) => void,
): MenuItemConstructorOptions[] {
    const enabled = Boolean(currentLocale);
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
    ];

    if (submenu.length) {
        submenu.push({type: "separator"});
    }

    submenu.push({
        label: "Enabled",
        type: "checkbox",
        checked: enabled,
        enabled: Boolean(detectedLocales.length),
        click() {
            onChangeLocale(!enabled);
        },
    });

    return [
        {
            label: "Spell check settings",
            submenu,
        },
    ];
}
