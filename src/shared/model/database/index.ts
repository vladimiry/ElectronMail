import {QueryResult} from "ndx-query";
import {Model as StoreModel} from "fs-json-store";

import * as Constants from "./constants";
import * as View from "./view";
import {AccountConfig} from "src/shared/model/account";
import {NumberString, Timestamp} from "src/shared/model/common";

export * from "./constants";

export {
    View,
    Constants,
};

export type Entity = NoExtraProperties<{
    readonly pk: string;
    readonly raw: string;
    readonly id: string;
}>;

export type Folder = NoExtraProperties<Entity & {
    readonly folderType: Unpacked<typeof Constants.MAIL_FOLDER_TYPE._.values>;
    readonly name: string;
    readonly mailFolderId: string;
    readonly exclusive: number;
}>

export type ConversationEntry = NoExtraProperties<Entity & {
    readonly conversationType: Unpacked<typeof Constants.CONVERSATION_TYPE._.values>;
    readonly messageId: string;
    readonly mailPk?: Mail["pk"];
    readonly previousPk?: ConversationEntry["pk"];
}>;

export type MailFailedDownload = NoExtraProperties<{
    readonly type: "body-decrypting";
    readonly errorMessage: string;
    readonly errorStack: string;
    readonly date: Timestamp;
    readonly appVersion: string;
}>

export type Mail = NoExtraProperties<Entity & {
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
}>;

export type MailAddress = NoExtraProperties<Entity & {
    readonly address: string;
    readonly name: string;
}>;

export type File = NoExtraProperties<Entity & {
    readonly mimeType?: string;
    readonly name: string;
    readonly size: number;
}>;

export type Contact = NoExtraProperties<Entity & {
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
}>;

export type ContactAddress = NoExtraProperties<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    readonly customTypeName: string;
    readonly address: string;
}>;

export type ContactMailAddress = NoExtraProperties<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    readonly customTypeName: string;
    readonly address: string;
}>;

export type Birthday = NoExtraProperties<Entity & {
    readonly day: NumberString;
    readonly month: NumberString;
    readonly year?: NumberString;
}>;

export type ContactPhoneNumber = NoExtraProperties<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_PHONE_NUMBER_TYPE._.values>;
    readonly customTypeName: string;
    readonly number: string;
}>;

export type ContactSocialId = NoExtraProperties<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_SOCIAL_TYPE._.values>;
    readonly customTypeName: string;
    readonly socialId: string;
}>;

export type ValidatedEntity = NoExtraProperties<{
    readonly _validated: undefined;
}>;

export type FsDbDataRecord<T extends ConversationEntry | Mail | Folder | Contact> = NoExtraProperties<Record<T["pk"], T & ValidatedEntity>>;

export type FsDbDataContainer = NoExtraProperties<Readonly<{
    conversationEntries: FsDbDataRecord<ConversationEntry>;
    mails: FsDbDataRecord<Mail>;
    folders: FsDbDataRecord<Folder>;
    contacts: FsDbDataRecord<Contact>;
}>>;

export type  FsDbDataContainerDeletedField = NoExtraProperties<Readonly<{
    deletedPks: NoExtraProperties<Readonly<{
        conversationEntries: Array<ConversationEntry["pk"]>;
        mails: Array<Mail["pk"]>;
        folders: Array<Folder["pk"]>;
        contacts: Array<Contact["pk"]>;
    }>>;
}>>;

type GenericDb<MetadataPart> = NoExtraProperties<{
    version: string;
    accounts: Record<AccountConfig["login"],
        Readonly<FsDbDataContainer & FsDbDataContainerDeletedField & NoExtraProperties<{ metadata: MetadataPart }>>>;
}>;

type ProtonMetadataPart = NoExtraProperties<{
    latestEventId: string; // Rest.Model.Event["EventID"]
}>;

export type FsDb = NoExtraProperties<Partial<StoreModel.StoreEntity> & GenericDb<ProtonMetadataPart>>;

export type FsDbAccount = NoExtraProperties<FsDb["accounts"][string]>;

export type DbAccountPk = NoExtraProperties<{
    login: string;
}>;

export type IndexableMail = NoExtraProperties<Pick<Mail, keyof Pick<Mail,
    | "pk"
    | "subject"
    | "body"
    | "sender"
    | "toRecipients"
    | "ccRecipients"
    | "bccRecipients"
    | "attachments">>>;

export type IndexableMailId = NoExtraProperties<IndexableMail["pk"]>;

export type MailsIndex = NoExtraProperties<{
    add: (mail: IndexableMail) => void;
    remove: (id: IndexableMailId) => void;
    search: (q: string) => {
        items: Array<QueryResult<IndexableMailId>>;
        expandedTerms: string[];
    };
}>;
