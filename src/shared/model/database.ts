import {AccountType} from "src/shared/model/account";
import {ClassType} from "class-transformer-validator";
import {Timestamp} from "src/shared/types";

export interface Base {
    raw: string;
}

export interface BasePersisted extends Base {
    pk: string;
    type: AccountType;
    login: string;
    id: string;
}

export interface MailAddress extends Base {
    address: string;
    name: string;
}

export interface File extends Base {
    mimeType?: string;
    name: string;
    size: number;
}

export interface Folder extends Base {
    type: MailFolderTypeValue;
    name: string;
}

export interface Mail extends BasePersisted {
    date: Timestamp;
    subject: string;
    body: string;
    folder: Folder;
    sender: MailAddress;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    attachments: File[];
    unread: boolean;
}

export type EntityRecord = Record<"Mail", ClassType<Mail>>;
export type EntityTable = keyof EntityRecord;

export type MailFolderTypeValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type MailFolderTypeTitle = "custom" | "inbox" | "sent" | "trash" | "archive" | "spam" | "draft";
