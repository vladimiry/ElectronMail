import {MenuItemConstructorOptions, WebContents} from "electron";

import {FuzzyLocale} from "./model";
import {Locale} from "src/shared/model/common";

export function buildSpellingSuggestionMenuItems(
    webContents: Readonly<WebContents>,
    suggestions: readonly string[],
): MenuItemConstructorOptions[] {
    if (!suggestions.length) {
        return [
            {
                label: "(No Spelling Suggestions)",
                enabled: false,
            },
        ];
    }
    return suggestions.map((suggestion) => {
        return {
            label: suggestion,
            click: (): void => {
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
    const checkSpelling = Boolean(currentLocale);
    const menuItems: MenuItemConstructorOptions[] = [
        {
            label: "Check Spelling",
            type: "checkbox",
            checked: checkSpelling,
            click(): void {
                onChangeLocale(!checkSpelling);
            },
        },
    ];

    if (!checkSpelling) {
        return menuItems;
    }

    return [
        ...menuItems,
        detectedLocales.length
            ? {
                label: "Languages",
                submenu: detectedLocales.map((detectedLocale) => {
                    return {
                        label: detectedLocale,
                        type: "radio",
                        enabled: checkSpelling,
                        checked: detectedLocale === currentLocale,
                        click() {
                            onChangeLocale(detectedLocale);
                        },
                    } as const;
                }),
            }
            : {
                label: "(No Languages)",
                enabled: false,
            },
    ];
}
