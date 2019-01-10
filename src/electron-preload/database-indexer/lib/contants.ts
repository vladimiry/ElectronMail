import {DeserializeOptions, FieldOptions} from "@vladimiry/ndx";

import {INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, IndexableMail, MailAddress} from "src/shared/model/database";
import {buildLoggerBundle} from "src/electron-preload/util";

export const LOGGER = buildLoggerBundle("[preload: database-indexer]");

export const MAILS_INDEX_DESERIALIZE_OPTIONS: Pick<Required<DeserializeOptions<IndexableMail["pk"], IndexableMail>>, "fieldsGetters">
    = (() => {
    const buildMailAddressGetter: (address: MailAddress) => string = (address) => address.address;
    const joinListBy = ", ";
    const fieldsGetters: Record<keyof typeof INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, FieldOptions<IndexableMail>["getter"]> = {
        subject: ({subject}) => subject,
        body: ({body}) => body,
        sender: ({sender}) => buildMailAddressGetter(sender),
        toRecipients: ({toRecipients}) => toRecipients
            .map(buildMailAddressGetter)
            .join(joinListBy),
        ccRecipients: ({ccRecipients}) => ccRecipients
            .map(buildMailAddressGetter)
            .join(joinListBy),
        bccRecipients: ({bccRecipients}) => bccRecipients
            .map(buildMailAddressGetter)
            .join(joinListBy),
        attachments: ({attachments}) => attachments
            .map(({name}) => name)
            .join(joinListBy),
    };
    const result: typeof MAILS_INDEX_DESERIALIZE_OPTIONS = {
        fieldsGetters,
    };

    return result;
})();
