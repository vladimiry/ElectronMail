import {DbFsDataContainer, IndexableMail} from "src/shared/model/database/index";
import {buildEnumBundle} from "src/shared/util";

export const PROTONMAIL_MAILBOX_IDENTIFIERS = buildEnumBundle({
    Inbox: "0",
    ["All Drafts"]: "1",
    ["All Sent"]: "2",
    Trash: "3",
    Spam: "4",
    ["All Mail"]: "5",
    Starred: "10",
    Archive: "6",
    Sent: "7",
    Drafts: "8",
    Search: "search",
    Label: "label",
});

export const OPERATION_TYPE = buildEnumBundle({
    CREATE: "0",
    UPDATE: "1",
    DELETE: "2",
});

export const MAIL_FOLDER_TYPE = buildEnumBundle({
    CUSTOM: "0",
    INBOX: "1",
    SENT: "2",
    TRASH: "3",
    ARCHIVE: "4",
    SPAM: "5",
    DRAFT: "6",
    ALL: "ALL",
    STARRED: "STARRED",
});

export const MAIL_STATE = buildEnumBundle({
    DRAFT: "0",
    SENT: "1",
    RECEIVED: "2",
    INBOX_AND_SENT: "100",
});

export const REPLY_TYPE = buildEnumBundle({
    NONE: "0",
    REPLY: "1",
    FORWARD: "2",
    REPLY_FORWARD: "3",
});

export const CONVERSATION_TYPE = buildEnumBundle({
    NEW: "0",
    REPLY: "1",
    FORWARD: "2",
    // TODO unexpected "CONVERSATION_TYPE=3" value actually used by Tutanota
    // not presented in https://github.com/tutao/tutanota/blob/b689218e6bae45bb38cfef7929494c708aa0f252/src/api/common/TutanotaConstants.js
    UNEXPECTED: "3",
});

export const CONTACT_ADDRESS_TYPE = buildEnumBundle({
    PRIVATE: "0",
    WORK: "1",
    OTHER: "2",
    CUSTOM: "3",
});

export const CONTACT_PHONE_NUMBER_TYPE = buildEnumBundle({
    PRIVATE: "0",
    WORK: "1",
    MOBILE: "2",
    FAX: "3",
    OTHER: "4",
    CUSTOM: "5",
});

export const CONTACT_SOCIAL_TYPE = buildEnumBundle({
    TWITTER: "0",
    FACEBOOK: "1",
    XING: "2",
    LINKED_IN: "3",
    OTHER: "4",
    CUSTOM: "5",
});

export const INDEXABLE_MAIL_FIELDS_STUB_CONTAINER: Readonly<Record<keyof Omit<IndexableMail, "pk">, null>> = {
    subject: null,
    body: null,
    sender: null,
    toRecipients: null,
    ccRecipients: null,
    bccRecipients: null,
    attachments: null,
};

export const INDEXABLE_MAIL_FIELDS: Readonly<Array<keyof typeof INDEXABLE_MAIL_FIELDS_STUB_CONTAINER>>
    = Object.keys(INDEXABLE_MAIL_FIELDS_STUB_CONTAINER) as any;

export const DB_DATA_CONTAINER_FIELDS_STUB_CONTAINER: Readonly<Record<keyof DbFsDataContainer, null>> = {
    conversationEntries: null,
    mails: null,
    folders: null,
    contacts: null,
};

export const DB_DATA_CONTAINER_FIELDS: Readonly<Array<keyof typeof DB_DATA_CONTAINER_FIELDS_STUB_CONTAINER>>
    = Object.keys(DB_DATA_CONTAINER_FIELDS_STUB_CONTAINER) as any;
