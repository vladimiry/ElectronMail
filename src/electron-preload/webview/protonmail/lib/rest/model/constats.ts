import {buildEnumBundle} from "src/shared/util";

export const MAILBOX_IDENTIFIERS = buildEnumBundle({
    Inbox: "0", // display: 1
    ["All Drafts"]: "1",
    ["All Sent"]: "2",
    Trash: "3", // display: 7
    Spam: "4", // display: 6
    ["All Mail"]: "5", // display: 8
    Starred: "10", // display: 4
    Archive: "6", // display: 5
    Sent: "7", // display: 3
    Drafts: "8", // display: 2
    Search: "search",
    Label: "label",
});

export const LOCATION = buildEnumBundle({
    location: 0,
    Inbox: 1,
    Draft: 2,
    Outbox: 3,
    Trash: 4,
    Spam: 6,
    Archive: 7,
});

export const MAIL_TYPE = buildEnumBundle({
    INBOX: 0,
    DRAFT: 1,
    SENT: 2,
    INBOX_AND_SENT: 3,
});

export const CONTACT_CARD = buildEnumBundle({
    CLEARTEXT: 0,
    ENCRYPTED_ONLY: 1,
    SIGNED: 2,
    BOTH: 3,
});

export const LABEL_TYPE = buildEnumBundle({
    MESSAGE: 1,
    CONTACT_GROUP: 2,
});

export const EVENT_ACTION = buildEnumBundle({
    DELETE: 0,
    CREATE: 1,
    UPDATE: 2,
    UPDATE_DRAFT: 2,
    UPDATE_FLAGS: 3,
});
