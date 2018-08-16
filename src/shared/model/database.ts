import {AccountConfig, AccountType} from "src/shared/model/account";
import {Omit, Timestamp} from "src/shared/types";

export interface Entity {
    pk: string;
    raw: string;
    instanceId: string;
}

export interface MailAddress extends Entity {
    address: string;
    name: string;
}

export interface File extends Entity {
    mimeType?: string;
    name: string;
    size: number;
}

export interface Folder extends Entity {
    folderType: MailFolderTypeValue;
    name: string;
}

export interface Mail extends Entity {
    date: Timestamp;
    subject: string;
    body: string;
    sender: MailAddress;
    toRecipients: MailAddress[];
    ccRecipients: MailAddress[];
    bccRecipients: MailAddress[];
    attachments: File[];
    unread: boolean;
}

export type MailFolderTypeValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type MailFolderTypeStringifiedValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type MailFolderTypeTitle = "custom" | "inbox" | "sent" | "trash" | "archive" | "spam" | "draft";

export interface EntityMap<K, V extends Entity> extends Omit<Map<K, V>, "set"> {
    set(value: V): Promise<this>;
}

type GenericDbContent<T extends AccountType, M> = Record<T, Record<AccountConfig<T>["login"], Readonly<{
    mails: EntityMap<Mail["pk"], Mail>;
    folders: EntityMap<Folder["pk"], Folder>;
    metadata: { type: T } & M;
}>>>;

export type DbContentIntersection = GenericDbContent<"tutanota", {
    lastBootstrappedMailInstanceId?: Mail["instanceId"],
    lastGroupEntityEventBatches: Record</* Rest.Model.Group["_id"] */ string, /* Rest.Model.EntityEventBatch["_id"][1] */ string>;
}> & GenericDbContent<"protonmail", {
    lastBootstrappedMailInstanceId_?: Mail["instanceId"];
}>;

export type DbContent<T extends keyof DbContentIntersection = keyof DbContentIntersection> = DbContentIntersection[T][string];
