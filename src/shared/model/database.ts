import {AccountConfig, AccountType} from "src/shared/model/account";
import {Omit, Timestamp} from "src/shared/types";

export interface Entity {
    pk: string;
    raw: string;
    id: string;
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

export interface EntityMap<K extends string, V extends Entity> extends Omit<Map<K, V>, "set"> {
    validateAndSet(value: V): Promise<this>;

    toObject(): Record<K, V>;
}

interface EntitiesMapContainer {
    mails: EntityMap<Mail["pk"], Mail>;
    folders: EntityMap<Folder["pk"], Folder>;
}

interface EntitiesRecordContainer {
    mails: Record<Mail["pk"], Mail>;
    folders: Record<Folder["pk"], Folder>;
}

type GenericDb<T extends AccountType, M, EntitiesContainer extends EntitiesMapContainer | EntitiesRecordContainer> =
    Record<T,
        Record<AccountConfig<T>["login"],
            Readonly<EntitiesContainer & { metadata: { type: T } & M }>>>;

interface TutanotaMetadataPart {
    groupEntityEventBatchIds: Record</* Rest.Model.Group["_id"] */ string, /* Rest.Model.EntityEventBatch["_id"][1] */ string>;
}

interface ProtonmailMetadataPart {
    propertyPlaceholder?: string;
}

export type MemoryDb =
    GenericDb<"tutanota", TutanotaMetadataPart, EntitiesMapContainer>
    &
    GenericDb<"protonmail", ProtonmailMetadataPart, EntitiesMapContainer>;

export type FsDb =
    GenericDb<"tutanota", TutanotaMetadataPart, EntitiesRecordContainer>
    &
    GenericDb<"protonmail", ProtonmailMetadataPart, EntitiesRecordContainer>;

export type DbContent<T extends keyof MemoryDb = keyof MemoryDb> = MemoryDb[T][string];
