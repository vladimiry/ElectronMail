import {QueryResult} from "ndx-query";
import {Model as StoreModel} from "fs-json-store";

import * as Constants from "./constants";
import * as View from "./view";
import {AccountConfig, AccountType} from "src/shared/model/account";
import {NumberString, Timestamp} from "src/shared/model/common";

export * from "./constants";

export {
    View,
    Constants,
};

export interface Entity {
    readonly pk: string;
    readonly raw: string;
    readonly id: string;
}

export interface Folder extends Entity {
    readonly folderType: Unpacked<typeof Constants.MAIL_FOLDER_TYPE._.values>;
    readonly name: string;
    readonly mailFolderId: string;
}

export interface ConversationEntry extends Entity {
    readonly conversationType: Unpacked<typeof Constants.CONVERSATION_TYPE._.values>;
    readonly messageId: string;
    readonly mailPk?: Mail["pk"];
    readonly previousPk?: ConversationEntry["pk"];
}

export interface MailFailedDownload {
    readonly type: "body-decrypting";
    readonly errorMessage: string;
    readonly errorStack: string;
    readonly date: Timestamp;
    readonly appVersion: string;
}

export interface Mail extends Entity {
    readonly conversationEntryPk: ConversationEntry["pk"];
    readonly mailFolderIds: ReadonlyArray<Folder["mailFolderId"]>;
    readonly sentDate: Timestamp;
    readonly subject: string;
    readonly body: string;
    readonly sender: MailAddress;
    readonly toRecipients: readonly MailAddress[];
    readonly ccRecipients: readonly MailAddress[];
    readonly bccRecipients: readonly MailAddress[];
    readonly attachments: readonly File[];
    readonly unread: boolean;
    readonly state: Unpacked<typeof Constants.MAIL_STATE._.values>;
    readonly confidential: boolean;
    readonly replyType: Unpacked<typeof Constants.REPLY_TYPE._.values>;
    readonly failedDownload?: MailFailedDownload;
}

export interface MailAddress extends Entity {
    readonly address: string;
    readonly name: string;
}

export interface File extends Entity {
    readonly mimeType?: string;
    readonly name: string;
    readonly size: number;
}

export interface Contact extends Entity {
    readonly comment: string;
    readonly company: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly nickname?: string;
    readonly role: string;
    readonly title?: string;
    readonly addresses: readonly ContactAddress[];
    readonly birthday?: Birthday;
    readonly mailAddresses: readonly ContactMailAddress[];
    readonly phoneNumbers: readonly ContactPhoneNumber[];
    readonly socialIds: readonly ContactSocialId[];
}

export interface ContactAddress extends Entity {
    readonly type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    readonly customTypeName: string;
    readonly address: string;
}

export interface ContactMailAddress extends Entity {
    readonly type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    readonly customTypeName: string;
    readonly address: string;
}

export interface Birthday extends Entity {
    readonly day: NumberString;
    readonly month: NumberString;
    readonly year?: NumberString;
}

export interface ContactPhoneNumber extends Entity {
    readonly type: Unpacked<typeof Constants.CONTACT_PHONE_NUMBER_TYPE._.values>;
    readonly customTypeName: string;
    readonly number: string;
}

export interface ContactSocialId extends Entity {
    readonly type: Unpacked<typeof Constants.CONTACT_SOCIAL_TYPE._.values>;
    readonly customTypeName: string;
    readonly socialId: string;
}

export interface ValidatedEntity {
    readonly _validated: undefined;
}

export type DbFsDataRecord<T extends ConversationEntry | Mail | Folder | Contact> = Record<T["pk"], T & ValidatedEntity>;

export type DbFsDataContainer = Readonly<{
    conversationEntries: DbFsDataRecord<ConversationEntry>;
    mails: DbFsDataRecord<Mail>;
    folders: DbFsDataRecord<Folder>;
    contacts: DbFsDataRecord<Contact>;
}>;

interface GenericDb<T extends AccountType, MetadataPart> {
    version: string;
    accounts: Record<T,
        Record<AccountConfig<T>["login"],
            Readonly<DbFsDataContainer & { metadata: { type: T } & MetadataPart }>>>;
}

interface TutanotaMetadataPart {
    groupEntityEventBatchIds: Record</* Rest.Model.Group["_id"] */ string, /* Rest.Model.EntityEventBatch["_id"][1] */ string>;
}

interface ProtonmailMetadataPart {
    latestEventId: string; // Rest.Model.Event["EventID"]
}

export type FsDb =
    & Partial<StoreModel.StoreEntity>
    & GenericDb<"tutanota", TutanotaMetadataPart>
    & GenericDb<"protonmail", ProtonmailMetadataPart>;

export type FsDbAccount<T extends keyof FsDb["accounts"] = keyof FsDb["accounts"]> = FsDb["accounts"][T][string];

export interface DbAccountPk {
    type: keyof FsDb["accounts"];
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
