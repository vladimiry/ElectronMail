import {addDocumentToIndex, createIndex, removeDocumentFromIndex} from "ndx";
import {expandTerm, query} from "ndx-query";
import {Subscription} from "rxjs";

import {buildLoggerBundle, resolveIpcMainApi} from "src/electron-preload/lib/util";
import {htmlToText} from "src/shared/util/html-to-text";
import {INDEXABLE_MAIL_FIELDS, IndexableMail, IndexableMailId, MailAddress, MailsIndex, MIME_TYPES} from "src/shared/model/database";

const logger = buildLoggerBundle(__filename);

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
    apiClient: (finishPromise: Promise<void>) => resolveIpcMainApi({finishPromise, logger}),
} as const;

const lowerCaseFilter = (term: string): string => {
    return term.toLowerCase();
};

type tokenizerType = (value: string) => string[];

const tokenizer: tokenizerType = (
    (): tokenizerType => {
        const tokenizeRe = /[\s-]+/; // whitespace and hyphen
        const result: tokenizerType = (value) => {
            return value.trim().split(tokenizeRe);
        };
        return result;
    }
)();

type trimNonLetterCharactersFilterType = (value: string) => string;

const trimNonLetterCharactersFilter: trimNonLetterCharactersFilterType = (
    (): trimNonLetterCharactersFilterType => {
        // TODO make sure all the possible unicode categories listed here except {L} and {N}
        const toTrim = "[\\p{M}\\p{Z}\\p{S}\\p{P}\\p{C}]+";
        const startEndTrimmingRe = new RegExp(`(^${toTrim})|(${toTrim}$)`, "gu");

        return (value: string) => value.replace(startEndTrimmingRe, "");
    }
)();

function buildFieldDescription(): DeepReadonly<Record<typeof INDEXABLE_MAIL_FIELDS[number], {
    accessor: (doc: IndexableMail) => string;
    boost: number;
}>> {
    const joinListBy = " ";
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
            accessor: ({body, subject, mimeType}) => {
                if (mimeType === MIME_TYPES.PLAINTEXT) {
                    return body;
                }

                try {
                    return htmlToText(body);
                } catch (error) {
                    if (error instanceof RangeError) {
                        const msg = `falling back to iframe-based "html-to-text" conversion`;
                        logger.error(msg, "error: ", error);
                        logger.verbose(msg, "subject: ", subject);
                        return body;
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
        mimeType: {
            accessor: ({mimeType}) => mimeType,
            boost: 0,
        },
    };
}

export function createMailsIndex(): MailsIndex {
    const fieldDescription = buildFieldDescription();
    const index = createIndex<IndexableMailId>(Object.keys(fieldDescription).length);
    const fields = Object.values(fieldDescription);
    const fieldAccessors = fields.map((field) => field.accessor);
    const fieldBoostFactors = fields.map((field) => field.boost);
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
            removeDocumentFromIndex(index, new Set<IndexableMailId>(), id);
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
