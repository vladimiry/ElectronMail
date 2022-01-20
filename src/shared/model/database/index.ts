import type {QueryResult} from "ndx-query";
import {Model as StoreModel} from "fs-json-store";

import {AccountConfig} from "src/shared/model/account";
import * as Constants from "./constants";
import {LABEL_TYPE} from "./constants";
import {NumberString, NumericBoolean, Timestamp} from "src/shared/model/common";
import * as View from "./view";

export * from "./constants";

export {Constants, View};

export type Entity = NoExtraProps<{
    readonly pk: string;
    readonly raw: string;
    readonly rawCompression?: "lzutf8";
    readonly id: string;
}>;

export type Folder = NoExtraProps<Entity & {
    readonly name: string;
    readonly type: Unpacked<typeof LABEL_TYPE._.values>;
    readonly notify: NumericBoolean;
}>

export type ConversationEntry = NoExtraProps<Entity & {
    readonly conversationType: Unpacked<typeof Constants.CONVERSATION_TYPE._.values>;
    readonly messageId: string;
    readonly mailPk?: Mail["pk"];
    readonly previousPk?: ConversationEntry["pk"];
}>;

export type MailFailedDownload = NoExtraProps<{
    readonly type: "body-decrypting";
    readonly errorMessage: string;
    readonly errorStack: string;
    readonly date: Timestamp;
    readonly appVersion: string;
}>

export type Mail = NoExtraProps<Entity & {
    readonly conversationEntryPk: ConversationEntry["pk"];
    readonly mailFolderIds: ReadonlyArray<Folder["id"]>;
    readonly sentDate: Timestamp;
    readonly subject: string;
    readonly body: string;
    readonly bodyCompression?: "lzutf8";
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
    readonly mimeType: Unpacked<typeof Constants.MIME_TYPES._.values>;
}>;

export type MailAddress = NoExtraProps<Entity & {
    readonly address: string;
    readonly name: string;
}>;

export type File = NoExtraProps<Entity & {
    readonly mimeType?: string;
    readonly name: string;
    readonly size: number;
}>;

export type Contact = NoExtraProps<Entity & {
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

export type ContactAddress = NoExtraProps<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    readonly customTypeName: string;
    readonly address: string;
}>;

export type ContactMailAddress = NoExtraProps<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_ADDRESS_TYPE._.values>;
    readonly customTypeName: string;
    readonly address: string;
}>;

export type Birthday = NoExtraProps<Entity & {
    readonly day: NumberString;
    readonly month: NumberString;
    readonly year?: NumberString;
}>;

export type ContactPhoneNumber = NoExtraProps<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_PHONE_NUMBER_TYPE._.values>;
    readonly customTypeName: string;
    readonly number: string;
}>;

export type ContactSocialId = NoExtraProps<Entity & {
    readonly type: Unpacked<typeof Constants.CONTACT_SOCIAL_TYPE._.values>;
    readonly customTypeName: string;
    readonly socialId: string;
}>;

export type ValidatedEntity = NoExtraProps<{
    readonly _validated: undefined;
}>;

export type FsDbDataRecord<T extends ConversationEntry | Mail | Folder | Contact> = NoExtraProps<Record<T["pk"], T & ValidatedEntity>>;

export type FsDbDataContainer = NoExtraProps<Readonly<{
    conversationEntries: FsDbDataRecord<ConversationEntry>;
    mails: FsDbDataRecord<Mail>;
    folders: FsDbDataRecord<Folder>;
    contacts: FsDbDataRecord<Contact>;
}>>;

export type  FsDbDataContainerDeletedField = NoExtraProps<Readonly<{
    deletedPks: NoExtraProps<Readonly<{
        conversationEntries: Array<ConversationEntry["pk"]>;
        mails: Array<Mail["pk"]>;
        folders: Array<Folder["pk"]>;
        contacts: Array<Contact["pk"]>;
    }>>;
}>>;

type GenericDb<MetadataPart> = NoExtraProps<{
    version: string
    dataSaltBase64?: string
    accounts: Record<AccountConfig["login"],
        Readonly<FsDbDataContainer & FsDbDataContainerDeletedField & NoExtraProps<{ metadata: MetadataPart }>>>
}>;

type ProtonMetadataPart = NoExtraProps<{
    latestEventId: string; // Rest.Model.Event["EventID"]
}>;

export type FsDb = NoExtraProps<Partial<StoreModel.StoreEntity> & GenericDb<ProtonMetadataPart>>;

export type FsDbAccount = NoExtraProps<FsDb["accounts"][string]>;

export type DbAccountPk = NoExtraProps<{
    login: string;
}>;

export type IndexableMail = NoExtraProps<Pick<Mail, keyof Pick<Mail,
    | "pk"
    | "subject"
    | "body"
    | "sender"
    | "toRecipients"
    | "ccRecipients"
    | "bccRecipients"
    | "attachments"
    | "mimeType">>>;

export type IndexableMailId = NoExtraProps<IndexableMail["pk"]>;

export type MailsIndex = NoExtraProps<{
    add: (mail: IndexableMail) => void;
    remove: (id: IndexableMailId) => void;
    search: (q: string) => {
        items: Array<QueryResult<IndexableMailId>>;
        expandedTerms: string[];
    };
}>;
