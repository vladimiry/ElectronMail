import {BaseEntity, GroupType, Id, IdTuple, MailFolderType} from "./common";

export interface User extends BaseEntity {
    memberships: GroupMembership[];
}

export interface Group extends BaseEntity {

}

export interface GroupMembership<TypeRecord = typeof GroupType> extends BaseEntity {
    groupType: TypeRecord[keyof TypeRecord];
    group: Id<Group>;
}

export interface MailboxGroupRoot extends BaseEntity {
    mailbox: Id<MailBox>;
}

export interface MailBox extends BaseEntity {
    systemFolders?: MailFolderRef;
}

export interface MailFolderRef extends BaseEntity {
    folders: Id<MailFolder>;
}

export interface MailFolder<TypeRecord = typeof MailFolderType> extends BaseEntity {
    folderType: TypeRecord[keyof TypeRecord];
    mails: Id<MailList>;
    subFolders: Id<MailFolder>;
    name: string;
}

export interface MailList extends BaseEntity {

}

export interface Mail extends BaseEntity {
    _id: IdTuple<MailList, Mail>;
    attachments: Array<IdTuple<Mail, File>>;
    body: IdTuple<Mail, MailBody>;
    subject: string;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    sender: MailAddress;
    unread: "0" | "1";
}

export interface MailAddress extends BaseEntity {
    address: string;
    name: string;
}

export interface File extends BaseEntity {

}

export interface MailBody extends BaseEntity {
    text: string;
}
