import {Provider as ElectronProvider} from "electron";

import {Locale} from "src/shared/types";

export type FuzzyLocale = null | true | "*" | Locale;

export interface Provider extends ElectronProvider {
    isMisspelled(text: string): boolean;

    getSuggestions(text: string): string[];

    add(text: string): void;
}
