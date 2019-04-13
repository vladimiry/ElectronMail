import {QueryResult} from "ndx-query";
import {Model as StoreModel} from "fs-json-store";

import * as Constants from "./constants";
import * as View from "./view";
import {AccountConfig, AccountType} from "src/shared/model/account";
import {NumberString, Omit, Timestamp, Unpacked} from "src/shared/types";

export * from "./constants";

export {
    View,
    Constants,
};

export interface Entity {
    pk: string;
    raw: string;
    id: string;
}

export interface Folder extends Entity {
    folderType: Unpacked<typeof Constants.MAIL_FOLDER_TYPE._.values>;
    name: string;
    mailFolderId: string;
}

export interface ConversationEntry extends Entity {
    conversationType: Unpacked<typeof Constants.CONVERSATION_TYPE._.values>;
    messageId: string;
    mailPk?: Mail["pk"];
    previousPk?: ConversationEntry["pk"];
}

export interface MailFailedDownload {
    type: "body-decrypting";
    errorMessage: string;
    errorStack: string;
    date: Timestamp;
    appVersion: string;
}

export interface Mail extends Entity {
    conversationEntryPk: ConversationEntry["pk"];
    mailFolderIds: Array<Folder["mailFolderId"]>;
    sentDate: Timestamp;
    subject: string;
    body: string;
    sender: MailAddress;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    attachments: File[];
    unread: boolean;
    state: Unpacked<typeof Constants.MAIL_STATE._.values>;
    confidential: boolean;
    replyType: Unpacked<typeof Constants.REPLY_TYPE._.values>;
    failedDownload?: MailFailedDownload;
}

export interface MailAddress extends Entity {
    address: string;
    name: string;
}

export interface File extends Entity {
    mimeType?: string;
    name: string;
    size: number;
}

export interface Contact extends Entity {
    comment: string;
    company: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    role: string;
    title?: string;
    addresses: ContactAddress[];
    birthday?: Birthday;
    mailAddresses: ContactMailAddress[];
    phoneNumbers: ContactPhoneNumber[];
    socialIds: ContactSocialId[];
}

export interface ContactAddress extends Entity {
    type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    customTypeName: string;
    address: string;
}

export interface ContactMailAddress extends Entity {
    type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    customTypeName: string;
    address: string;
}

export interface Birthday extends Entity {
    day: NumberString;
    month: NumberString;
    year?: NumberString;
}

export interface ContactPhoneNumber extends Entity {
    type: Unpacked<typeof Constants.CONTACT_PHONE_NUMBER_TYPE._.values>;
    customTypeName: string;
    number: string;
}

export interface ContactSocialId extends Entity {
    type: Unpacked<typeof Constants.CONTACT_SOCIAL_TYPE._.values>;
    customTypeName: string;
    socialId: string;
}

export interface EntityMap<V extends Entity, K extends V["pk"] = V["pk"]> extends Omit<Map<K, V>, "set"> {
    validateAndSet(value: V): Promise<this>;

    toObject(): Record<K, V>;
}

export interface DbMemoryDataContainer {
    conversationEntries: EntityMap<ConversationEntry>;
    mails: EntityMap<Mail>;
    folders: EntityMap<Folder>;
    contacts: EntityMap<Contact>;
}

export interface DbFsDataContainer {
    conversationEntries: Record<ConversationEntry["pk"], ConversationEntry>;
    mails: Record<Mail["pk"], Mail>;
    folders: Record<Folder["pk"], Folder>;
    contacts: Record<Contact["pk"], Contact>;
}

interface GenericDb<T extends AccountType, MetadataPart, EntitiesContainer extends DbMemoryDataContainer | DbFsDataContainer> {
    version: string;
    accounts: Record<T,
        Record<AccountConfig<T>["login"],
            Readonly<EntitiesContainer & { metadata: { type: T } & MetadataPart }>>>;
}

interface TutanotaMetadataPart {
    groupEntityEventBatchIds: Record</* Rest.Model.Group["_id"] */ string, /* Rest.Model.EntityEventBatch["_id"][1] */ string>;
}

interface ProtonmailMetadataPart {
    latestEventId: string; // Rest.Model.Event["EventID"]
}

export type MemoryDb =
    GenericDb<"tutanota", TutanotaMetadataPart, DbMemoryDataContainer>
    &
    GenericDb<"protonmail", ProtonmailMetadataPart, DbMemoryDataContainer>;

export type FsDb = Partial<StoreModel.StoreEntity> &
    (GenericDb<"tutanota", TutanotaMetadataPart, DbFsDataContainer>
        &
        GenericDb<"protonmail", ProtonmailMetadataPart, DbFsDataContainer>);

export type MemoryDbAccount<T extends keyof MemoryDb["accounts"] = keyof MemoryDb["accounts"]> = MemoryDb["accounts"][T][string];

export type FsDbAccount<T extends keyof FsDb["accounts"] = keyof FsDb["accounts"]> = FsDb["accounts"][T][string];

export interface DbAccountPk {
    type: keyof MemoryDb["accounts"];
    login: string;
}

export type IndexableMail = Pick<Mail, keyof Pick<Mail,
    | "pk"
    | "subject"
    | "body"
    | "sender"
    | "toRecipients"
    | "ccRecipients"
    | "bccRecipients"
    | "attachments">>;

export type IndexableMailId = IndexableMail["pk"];

export interface MailsIndex {
    add: (mail: IndexableMail) => void;
    remove: (id: IndexableMailId) => void;
    search: (q: string) => {
        items: Array<QueryResult<IndexableMailId>>;
        expandedTerms: string[],
    };
}
