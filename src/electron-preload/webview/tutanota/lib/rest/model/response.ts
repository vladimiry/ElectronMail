import {BaseEntity, GroupType, Id, IdTuple, NumberString} from "./common";

export interface User extends BaseEntity<Id> {
    memberships: GroupMembership[];
}

export interface Group extends BaseEntity<Id> {

}

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

export interface MailBoxReceivedAttachment extends BaseEntity<Id> {

}

export interface MailFolderRef extends BaseEntity<Id> {
    folders: Id<MailFolder["_id"][0]>;
}

export interface MailFolder extends BaseEntity<IdTuple> {
    folderType: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
    mails: MailList["_id"];
    subFolders: Id<MailFolder["_id"][0]>;
    name: string;
}

export interface MailList extends BaseEntity<Id> {

}

export interface Mail extends BaseEntity<[MailList["_id"], Id]> {
    sentDate: string; // timestamp;
    receivedDate: string; // timestamp;
    subject: string;
    body: MailBody["_id"];
    sender: MailAddress;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    attachments: Array<IdTuple<MailBox["receivedAttachments"], File["_id"]>>;
    unread: "0" | "1";
}

export interface MailAddress extends BaseEntity<Id> {
    address: string;
    name: string;
}

export interface File extends BaseEntity<Id> {
    mimeType?: string;
    name: string;
    size: NumberString;
}

export interface MailBody extends BaseEntity<Id> {
    text: string;
}
