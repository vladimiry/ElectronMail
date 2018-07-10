import {BaseResponse, GroupType, Id, IdTuple, MailFolderType} from "./common";

export interface User extends BaseResponse {
    memberships: GroupMembership[];
}

export interface Group extends BaseResponse {

}

export interface GroupMembership<TypeRecord = typeof GroupType> extends BaseResponse {
    groupType: TypeRecord[keyof TypeRecord];
    group: Id<Group>;
}

export interface MailboxGroupRoot extends BaseResponse {
    mailbox: Id<MailBox>;
}

export interface MailBox extends BaseResponse {
    systemFolders?: MailFolderRef;
}

export interface MailFolderRef extends BaseResponse {
    folders: Id<MailFolder>;
}

export interface MailFolder<TypeRecord = typeof MailFolderType> extends BaseResponse {
    folderType: TypeRecord[keyof TypeRecord];
    mails: Id<Mail>;
    subFolders: Id<MailFolder>;
}

export interface Mail extends BaseResponse {
    attachments: Array<IdTuple<File>>;
    body: Id<MailBody>;
    subject: string;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    sender: MailAddress;
    unread: "0" | "1";
}

export interface MailAddress extends BaseResponse {
    address: string;
    name: string;
}

export interface File extends BaseResponse {

}

export interface MailBody extends BaseResponse {
    text: string;
}
