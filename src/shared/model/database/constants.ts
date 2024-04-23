import {BINARY_NAME} from "src/shared/const";
import {buildEnumBundle} from "src/shared/util";
import {FsDbDataContainer, IndexableMail} from "src/shared/model/database/index";

export const SYSTEM_FOLDER_IDENTIFIERS = buildEnumBundle(
    {
        ["Virtual Unread"]: `${BINARY_NAME}_virtual_unread_id`.replace(/[a-z0-9_]/gi, "_"), // virtual "id" value (not stored anywhere)
        Inbox: "0",
        ["All Drafts"]: "1",
        ["All Sent"]: "2",
        Trash: "3",
        Spam: "4",
        ["All Mail"]: "5",
        ["Almost All Mail"]: "15",
        Starred: "10",
        Archive: "6",
        Sent: "7",
        Drafts: "8",
        Search: "search",
        Label: "label",
    } as const,
);

export const LABEL_TYPE = buildEnumBundle({MESSAGE_LABEL: 1, CONTACT_GROUP: 2, MESSAGE_FOLDER: 3} as const);

export const MAIL_STATE = buildEnumBundle({DRAFT: "0", SENT: "1", RECEIVED: "2", PROTONMAIL_INBOX_AND_SENT: "100"} as const);

export const REPLY_TYPE = buildEnumBundle({NONE: "0", REPLY: "1", FORWARD: "2", REPLY_FORWARD: "3"} as const);

export const CONVERSATION_TYPE = buildEnumBundle({NEW: "0", REPLY: "1", FORWARD: "2", UNEXPECTED: "3"} as const);

export const CONTACT_ADDRESS_TYPE = buildEnumBundle({PRIVATE: "0", WORK: "1", OTHER: "2", CUSTOM: "3"} as const);

export const CONTACT_PHONE_NUMBER_TYPE = buildEnumBundle(
    {PRIVATE: "0", WORK: "1", MOBILE: "2", FAX: "3", OTHER: "4", CUSTOM: "5"} as const,
);

export const CONTACT_SOCIAL_TYPE = buildEnumBundle(
    {TWITTER: "0", FACEBOOK: "1", XING: "2", LINKED_IN: "3", OTHER: "4", CUSTOM: "5"} as const,
);

export const MIME_TYPES = buildEnumBundle({MIME: "multipart/mixed", PLAINTEXT: "text/plain", DEFAULT: "text/html", AUTOMATIC: ""} as const);

export const INDEXABLE_MAIL_FIELDS: ReadonlyArray<keyof Omit<IndexableMail, "pk">> = [
    "subject",
    "body",
    "sender",
    "toRecipients",
    "ccRecipients",
    "bccRecipients",
    "attachments",
    "mimeType",
] as const;

export const DB_DATA_CONTAINER_FIELDS_STUB_CONTAINER: Readonly<Record<keyof FsDbDataContainer, null>> = {
    conversationEntries: null,
    mails: null,
    folders: null,
    contacts: null,
};

// eslint-disable-next-line  @typescript-eslint/no-unsafe-assignment
export const DB_DATA_CONTAINER_FIELDS: Readonly<Array<keyof typeof DB_DATA_CONTAINER_FIELDS_STUB_CONTAINER>> = Object.keys(
    DB_DATA_CONTAINER_FIELDS_STUB_CONTAINER,
) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
