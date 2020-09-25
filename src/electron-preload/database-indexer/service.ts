import {Subscription} from "rxjs";
import {addDocumentToIndex, createIndex, removeDocumentFromIndex, vacuumIndex} from "ndx";
import {expandTerm, query} from "ndx-query";
import {fromString as htmlToText} from "html-to-text";

import {Config} from "src/shared/model/options";
import {INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, IndexableMail, IndexableMailId, MailAddress, MailsIndex} from "src/shared/model/database";
import {IPC_MAIN_API} from "src/shared/api/main";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

const logger = buildLoggerBundle("[preload: database-indexer: service]");

export const SERVICES_FACTORY = {
    // tslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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
    // tslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    apiClient: (finishPromise: Promise<void>) => {
        return IPC_MAIN_API.client({
            options: {
                finishPromise,
                logger,
            },
        });
    },
} as const;

const lowerCaseFilter = (term: string): string => {
    return term.toLowerCase();
};

const tokenizer: (value: string) => string[] = (
    (): typeof tokenizer => {
        const tokenizeRe = /[\s-]+/; // whitespace and hyphen
        const result: typeof tokenizer = (value) => {
            return value.trim().split(tokenizeRe);
        };
        return result;
    }
)();

const trimNonLetterCharactersFilter: (value: string) => string = (
    (): typeof trimNonLetterCharactersFilter => {
        // TODO make sure all the possible unicode categories listed here except {L} and {N}
        const toTrim = "[\\p{M}\\p{Z}\\p{S}\\p{P}\\p{C}]+";
        const startEndTrimmingRe = new RegExp(`(^${toTrim})|(${toTrim}$)`, "gu");

        return (value: string) => value.replace(startEndTrimmingRe, "");
    }
)();

function buildFieldDescription(
    options: NoExtraProperties<Pick<Config, "htmlToText">>,
): DeepReadonly<Record<keyof typeof INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, {
    accessor: (doc: IndexableMail) => string;
    boost: number;
}>> {
    const joinListBy = " ";
    const htmlToTextOptions = {limits: options.htmlToText} as const;
    const buildMailAddressGetter: (address: MailAddress) => string = (address) => {
        return [
            ...(address.name ? [address.name] : []),
            address.address,
        ].join(joinListBy);
    };

    return {
        subject: {
            accessor: ({subject}) => subject,
            boost: 7,
        },
        body: {
            accessor: ({body, subject}) => {
                try {
                    return htmlToText(body);
                } catch (error) {
                    if (error instanceof RangeError) {
                        logger.error(`falling back to "htmlToText" call with "limit" options`, error);
                        logger.verbose("problematic mail subject: ", subject);
                        return htmlToText(body, htmlToTextOptions);
                    }
                    throw error;
                }
            },
            boost: 5,
        },
        sender: {
            accessor: ({sender}) => buildMailAddressGetter(sender),
            boost: 1,
        },
        toRecipients: {
            accessor: ({toRecipients}) => toRecipients
                .map(buildMailAddressGetter)
                .join(joinListBy),
            boost: 1,
        },
        ccRecipients: {
            accessor: ({ccRecipients}) => ccRecipients
                .map(buildMailAddressGetter)
                .join(joinListBy),
            boost: 1,
        },
        bccRecipients: {
            accessor: ({bccRecipients}) => bccRecipients
                .map(buildMailAddressGetter)
                .join(joinListBy),
            boost: 1,
        },
        attachments: {
            accessor: ({attachments}) => attachments
                .map(({name}) => name)
                .join(joinListBy),
            boost: 1,
        },
    };
}

export function createMailsIndex(
    {htmlToText}: Pick<Config, "htmlToText">,
): MailsIndex {
    const fieldDescription = buildFieldDescription({htmlToText});
    const index = createIndex<IndexableMailId>(Object.keys(fieldDescription).length);
    const fields = Object.values(fieldDescription);
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
        remove: (id) => {
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
