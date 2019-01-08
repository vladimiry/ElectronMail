import {DocumentIndex} from "@vladimiry/ndx";

import {IndexableMail} from "src/shared/model/database";
import {MAILS_INDEX_DESERIALIZE_OPTIONS} from "./contants";
import {MailsIndex} from "src/electron-preload/database-indexer/lib/types";

export function buildMailsIndex(): MailsIndex {
    const index = new DocumentIndex<IndexableMail["pk"], IndexableMail>();
    const {fieldsGetters} = MAILS_INDEX_DESERIALIZE_OPTIONS;

    Object.keys(fieldsGetters).forEach((name) => {
        index.addField(name, {getter: fieldsGetters[name]});
    });

    return index;
}

export async function addToMailsIndex(
    index: MailsIndex,
    mails: IndexableMail[],
): Promise<void> {
    for (const mail of mails) {
        index.add(mail.pk, mail);
    }
}

export async function removeMailsFromIndex(
    index: MailsIndex,
    pks: Array<Pick<IndexableMail, "pk">>,
): Promise<void> {
    for (const {pk} of pks) {
        index.remove(pk);
    }
}
