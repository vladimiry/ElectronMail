import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, IndexableMail, MailAddress} from "src/shared/model/database";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

const htmlToText: { fromString: (value: string) => string } = remote.require("html-to-text");

export const LOGGER = buildLoggerBundle("[preload: database-indexer]");

export const FIELD_DESCRIPTION: Record<keyof typeof INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, {
    accessor: (doc: IndexableMail) => string,
    boost: number;
}> = (() => {
    const joinListBy = " ";
    const buildMailAddressGetter: (address: MailAddress) => string = (address) => {
        return [
            ...(address.name ? [address.name] : []),
            address.address,
        ].join(joinListBy);
    };
    const result: typeof FIELD_DESCRIPTION = {
        subject: {
            accessor: ({subject}) => subject,
            boost: 7,
        },
        body: {
            accessor: ({body}) => htmlToText.fromString(body),
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

    return result;
})();
