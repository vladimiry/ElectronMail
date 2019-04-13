import {buildEnumBundle} from "src/shared/util";

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

export const ENCRYPTED_STATUS = buildEnumBundle({
    NONE: 0,
    INTERNAL: 1,
    EXTERNAL: 2,
    OUT_ENC: 3,
    OUT_PLAIN: 4,
    STORED_ENC: 5,
    PGP_INLINE: 7,
    PGP_MIME: 8,
    PGP_MIME_SIGNED: 9,
    AUTOREPLY: 10,
});

export const UPSERT_EVENT_ACTIONS = [
    EVENT_ACTION.CREATE,
    EVENT_ACTION.UPDATE,
    EVENT_ACTION.UPDATE_DRAFT,
    EVENT_ACTION.UPDATE_FLAGS,
];
