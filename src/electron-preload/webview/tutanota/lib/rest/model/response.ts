import {BaseEntity, Id, IdTuple, TypeRefApp, TypeRefType} from "./common";
import {
    CONTACT_ADDRESS_TYPE,
    CONTACT_PHONE_NUMBER_TYPE,
    CONTACT_SOCIAL_TYPE,
    GROUP_TYPE,
    MAIL_FOLDER_TYPE,
    MAIL_STATE,
    OPERATION_TYPE,
} from "src/shared/model/database";
import {NumberString} from "src/shared/types";

export interface User extends BaseEntity<Id> {
    memberships: GroupMembership[];
    userGroup: GroupMembership;
}

export interface Group extends BaseEntity<Id> {}

export interface GroupMembership<TypeRecord = typeof GROUP_TYPE._.map> extends BaseEntity<Id> {
    groupType: TypeRecord[keyof TypeRecord];
    group: Group["_id"];
}

export interface MailboxGroupRoot extends BaseEntity<Id> {
    mailbox: MailBox["_id"];
}

export interface MailBox extends BaseEntity<Id> {
    systemFolders?: MailFolderRef;
    receivedAttachments: MailBoxReceivedAttachment["_id"];
}

export interface MailBoxReceivedAttachment extends BaseEntity<Id> {}

export interface MailFolderRef extends BaseEntity<Id> {
    folders: Id<MailFolder["_id"][0]>;
}

export interface MailFolder<TypeRecord = typeof MAIL_FOLDER_TYPE._.map> extends BaseEntity<IdTuple> {
    folderType: TypeRecord[keyof TypeRecord];
    mails: MailList["_id"];
    subFolders: Id<MailFolder["_id"][0]>;
    name: string;
}

export interface MailList extends BaseEntity<Id> {}

export interface Mail<StateRecord = typeof MAIL_STATE._.map> extends BaseEntity<[MailList["_id"], Id]> {
    sentDate: NumberString; // timestamp;
    receivedDate: NumberString; // timestamp;
    subject: string;
    body: MailBody["_id"];
    sender: MailAddress;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    attachments: Array<File["_id"]>;
    unread: "0" | "1";
    state: StateRecord[keyof StateRecord];
}

export interface MailAddress extends BaseEntity<Id> {
    address: string;
    name: string;
}

export interface File extends BaseEntity<[MailBox["receivedAttachments"], Id]> {
    mimeType?: string;
    name: string;
    size: NumberString;
}

export interface MailBody extends BaseEntity<Id> {
    text: string;
}

export interface Contact extends BaseEntity<IdTuple> {
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

export interface ContactAddress<TypeRecord = typeof CONTACT_ADDRESS_TYPE> extends BaseEntity<Id> {
    type: TypeRecord[keyof TypeRecord];
    customTypeName: string;
    address: string;
}

export interface ContactMailAddress<TypeRecord = typeof CONTACT_ADDRESS_TYPE._.map> extends BaseEntity<Id> {
    type: TypeRecord[keyof TypeRecord];
    customTypeName: string;
    address: string;
}

export interface ContactPhoneNumber<TypeRecord = typeof CONTACT_PHONE_NUMBER_TYPE._.map> extends BaseEntity<Id> {
    type: TypeRecord[keyof TypeRecord];
    customTypeName: string;
    number: string;
}

export interface ContactSocialId<TypeRecord = typeof CONTACT_SOCIAL_TYPE._.map> extends BaseEntity<Id> {
    type: TypeRecord[keyof TypeRecord];
    customTypeName: string;
    socialId: string;
}

export interface Birthday extends BaseEntity<Id> {
    day: NumberString;
    month: NumberString;
    year?: NumberString;
}

export interface EntityUpdate<OperationRecord = typeof OPERATION_TYPE._.map> extends BaseEntity<Id> {
    application: TypeRefApp;
    type: TypeRefType;
    instanceId: Id;
    instanceListId: Id;
    operation: OperationRecord[keyof OperationRecord];
}

export interface EntityEventBatch extends BaseEntity<[GroupMembership["_id"], Id]> {
    events: EntityUpdate[];
}
