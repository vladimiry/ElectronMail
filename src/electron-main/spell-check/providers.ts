import {Spellchecker} from "spellchecker";

import {Locale} from "src/shared/types";
import {Provider} from "./model";
import {removeDuplicateItems} from "src/shared/util";

// tslint:disable-next-line
// https://github.com/electron-userland/electron-spellchecker/blob/6da4984fcecb9ea05d322abf66ac904252e61c35/src/spell-check-handler.js#L52-L70
// NB: This is to work around electron/electron#1005, where contractions
// are incorrectly marked as spelling errors. This lets people get away with
// incorrectly spelled contracted words, but it's the best we can do for now.
const contractions: ReadonlySet<string> = new Set(
    [
        "ain't", "aren't", "can't", "could've", "couldn't", "couldn't've", "didn't", "doesn't", "don't", "hadn't",
        "hadn't've", "hasn't", "haven't", "he'd", "he'd've", "he'll", "he's", "how'd", "how'll", "how's", "I'd",
        "I'd've", "I'll", "I'm", "I've", "isn't", "it'd", "it'd've", "it'll", "it's", "let's", "ma'am", "mightn't",
        "mightn't've", "might've", "mustn't", "must've", "needn't", "not've", "o'clock", "shan't", "she'd", "she'd've",
        "she'll", "she's", "should've", "shouldn't", "shouldn't've", "that'll", "that's", "there'd", "there'd've",
        "there're", "there's", "they'd", "they'd've", "they'll", "they're", "they've", "wasn't", "we'd", "we'd've",
        "we'll", "we're", "we've", "weren't", "what'll", "what're", "what's", "what've", "when's", "where'd",
        "where's", "where've", "who'd", "who'll", "who're", "who's", "who've", "why'll", "why're", "why's", "won't",
        "would've", "wouldn't", "wouldn't've", "y'all", "y'all'd've", "you'd", "you'd've", "you'll", "you're", "you've",
    ].map((word) => {
        return word.replace(/'/g, "");
    }),
);

export function constructProvider(
    locale: Locale,
    spellchecker: Spellchecker,
): Readonly<Provider> {
    const provider: ReturnType<typeof constructProvider> = {
        spellCheck(words, callback) {
            callback(
                removeDuplicateItems(
                    words.reduce(
                        (misspelledWords: typeof words, word) => {
                            if (provider.isMisspelled(word)) {
                                misspelledWords.push(word);
                            }
                            return misspelledWords;
                        },
                        [],
                    ),
                ),
            );
        },
        isMisspelled(text) {
            if (
                locale.toLowerCase().startsWith("en")
                &&
                contractions.has(String(text).toLowerCase())
            ) {
                return false;
            }
            return spellchecker.isMisspelled(text);
        },
        getSuggestions(text) {
            return spellchecker.getCorrectionsForMisspelling(text);
        },
        add(text) {
            spellchecker.add(text);
        },
    };
    return provider;
}

export function constructDummyProvider(): Readonly<Provider> {
    return {
        spellCheck(...[, callback]) {
            callback([]);
        },
        isMisspelled() {
            return false;
        },
        getSuggestions() {
            return [];
        },
        add() {
            // NOOP
        },
    };
}
