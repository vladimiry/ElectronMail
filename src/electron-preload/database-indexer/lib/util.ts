import {Subscription} from "rxjs";
import {addDocumentToIndex, createIndex, removeDocumentFromIndex, vacuumIndex} from "ndx";
import {expandTerm, query} from "ndx-query";

import {FIELD_DESCRIPTION, LOGGER} from "./contants";
import {IPC_MAIN_API} from "src/shared/api/main";
import {IndexableMail, IndexableMailId, MailsIndex} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(LOGGER, "[lib/util]");

export const SERVICES_FACTORY = {
    cleanup: () => {
        const subscription = new Subscription();
        const promise = new Promise<void>((resolve) => {
            window.onbeforeunload = () => {
                resolve();
                subscription.unsubscribe();
                logger.info(`"window.beforeunload" handler executed`);
            };
        });
        return {subscription, promise};
    },
    apiClient: (finishPromise: Promise<void>) => {
        return IPC_MAIN_API.client({
            options: {
                finishPromise,
                logger,
            },
        });
    },
};

const lowerCaseFilter = (term: string): string => {
    return term.toLowerCase();
};

const tokenizer: (value: string) => string[] = (() => {
    const tokenizeRe = /[\s-]+/; // whitespace and hyphen
    const result: typeof tokenizer = (value) => {
        return value.trim().split(tokenizeRe);
    };
    return result;
})();

const trimNonLetterCharactersFilter: (value: string) => string = (() => {
    // TODO make sure all the possible unicode categories listed here except {L} and {N}
    const toTrim = "[\\p{M}\\p{Z}\\p{S}\\p{P}\\p{C}]+";
    const startEndTrimmingRe = new RegExp(`(^${toTrim})|(${toTrim}$)`, "gu");

    return (value: string) => value.replace(startEndTrimmingRe, "");
})();

export function createMailsIndex(): MailsIndex {
    const index = createIndex<IndexableMailId>(Object.keys(FIELD_DESCRIPTION).length);
    const fields = Object.values(FIELD_DESCRIPTION);
    const fieldAccessors = fields.map((field) => field.accessor);
    const fieldBoostFactors = fields.map((field) => field.boost);
    const removed = new Set<IndexableMailId>();
    const termFilter = (term: string): string => {
        return trimNonLetterCharactersFilter( // "trimNonWordCharactersFilter" from "ndx-utils" is too aggressive
            lowerCaseFilter(term),
        );
    };

    return {
        add: (mail) => addDocumentToIndex(
            index,
            fieldAccessors,
            tokenizer,
            termFilter,
            mail.pk,
            mail,
        ),
        remove: (id: IndexableMailId) => {
            removeDocumentFromIndex(index, removed, id);

            if (removed.size > 25) {
                vacuumIndex(index, removed);
            }
        },
        search: (q) => {
            return {
                items: query(
                    index,
                    fieldBoostFactors,
                    1.2,
                    0.75,
                    tokenizer,
                    termFilter,
                    undefined,
                    q,
                ),
                expandedTerms: expandTerm(index, q),
            };
        },
    };
}

export function addToMailsIndex(
    index: MailsIndex,
    mails: IndexableMail[],
): void {
    for (const mail of mails) {
        index.add(mail);
    }
}

export function removeMailsFromIndex(
    index: MailsIndex,
    pks: Array<Pick<IndexableMail, "pk">>,
): void {
    for (const {pk} of pks) {
        index.remove(pk);
    }
}
