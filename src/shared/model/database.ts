import {AccountType} from "src/shared/model/account";
import {Timestamp} from "src/shared/types";

export interface Persistent {
    pk: string;
}

export interface Base {
    id: string;
    date: Timestamp;
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

export interface Mail extends Base {
    type: AccountType;
    login: string;
    subject: string;
    body: string;
    sender: MailAddress;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    attachments: File[];
    unread: boolean;
}

export type PersistentMail = Mail & Persistent;
