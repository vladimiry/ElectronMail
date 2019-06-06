import {Provider as ElectronProvider} from "electron";

import {Locale} from "src/shared/model/common";

export type FuzzyLocale = Locale | true | false;

export interface Provider extends ElectronProvider {
    isMisspelled(text: string): boolean;

    getSuggestions(text: string): string[];

    add(text: string): void;
}

export interface Controller {
    getSpellCheckProvider(): Readonly<Provider>;

    getCurrentLocale(): Exclude<FuzzyLocale, true>;

    changeLocale(locale: FuzzyLocale): Promise<void>;

    getAvailableDictionaries(): Promise<readonly  Locale[]>;
}
