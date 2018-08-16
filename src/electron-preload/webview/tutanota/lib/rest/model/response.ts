import {BaseEntity, GroupType, Id, IdTuple, MailState, NumberString, OperationType, TypeRefApp, TypeRefType} from "./common";
import {MailFolderTypeStringifiedValue} from "src/shared/model/database";

export interface User extends BaseEntity<Id> {
    memberships: GroupMembership[];
    userGroup: GroupMembership;
}

export interface Group extends BaseEntity<Id> {}

export interface GroupMembership<TypeRecord = typeof GroupType> extends BaseEntity<Id> {
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

export interface MailFolder extends BaseEntity<IdTuple> {
    folderType: MailFolderTypeStringifiedValue;
    mails: MailList["_id"];
    subFolders: Id<MailFolder["_id"][0]>;
    name: string;
}

export interface MailList extends BaseEntity<Id> {}

export interface Mail<StateRecord = typeof MailState> extends BaseEntity<[MailList["_id"], Id]> {
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

export interface EntityUpdate<OperationRecord = typeof OperationType> extends BaseEntity<Id> {
    application: TypeRefApp;
    type: TypeRefType;
    instanceId: Id;
    instanceListId: Id;
    operation: OperationRecord[keyof OperationRecord];
}

export interface EntityEventBatch extends BaseEntity<[GroupMembership["_id"], Id]> {
    events: EntityUpdate[];
}
