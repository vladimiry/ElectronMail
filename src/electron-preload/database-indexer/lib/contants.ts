import {DeserializeOptions, FieldOptions} from "@vladimiry/ndx";

import {IndexableMail, MailAddress} from "src/shared/model/database";
import {Omit} from "src/shared/types";
import {buildLoggerBundle} from "src/electron-preload/util";

export const LOGGER = buildLoggerBundle("[database-indexer]");

export const MAILS_INDEX_DESERIALIZE_OPTIONS: Pick<Required<DeserializeOptions<IndexableMail["pk"], IndexableMail>>, "fieldsGetters">
    = (() => {
    type IndexableField = keyof Omit<IndexableMail, "pk">;

    const buildMailAddressGetter: (address: MailAddress) => string = (address) => address.address;
    const joinListBy = ", ";
    const fieldsGetters: Record<IndexableField, FieldOptions<IndexableMail>["getter"]> = {
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
