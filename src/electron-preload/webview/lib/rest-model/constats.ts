import {buildEnumBundle} from "src/shared/util";

export const LOCATION = buildEnumBundle({
    location: 0,
    Inbox: 1,
    Draft: 2,
    Outbox: 3,
    Trash: 4,
    Spam: 6,
    Archive: 7,
} as const);

export const MAIL_TYPE = buildEnumBundle({
    INBOX: 0,
    DRAFT: 1,
    SENT: 2,
    PROTONMAIL_INBOX_AND_SENT: 3,
} as const);

export const CONTACT_CARD = buildEnumBundle({
    CLEARTEXT: 0,
    ENCRYPTED_ONLY: 1,
    SIGNED: 2,
    BOTH: 3,
} as const);

// https://github.com/ProtonMail/proton-shared/blob/64d6d0b6c60b05785bd06d2b8fa90471b27046a2/lib/constants.ts#L140-L146
export const EVENT_ACTION = buildEnumBundle({
    DELETE: 0,
    CREATE: 1,
    UPDATE: 2,
    UPDATE_DRAFT: 2,
    UPDATE_FLAGS: 3,
} as const);

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
} as const);
