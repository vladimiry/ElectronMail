import {Provider as ElectronProvider} from "electron";

import {Locale} from "src/shared/types";

export type FuzzyLocale = Locale | boolean;

export interface Provider extends ElectronProvider {
    isMisspelled(text: string): boolean;

    getSuggestions(text: string): string[];

    add(text: string): void;
}
