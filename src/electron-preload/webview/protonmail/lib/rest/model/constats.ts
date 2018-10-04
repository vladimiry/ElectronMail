import {buildEnumBundle} from "src/shared/util";

export const MAILBOX_IDENTIFIERS = buildEnumBundle({
    inbox: "0",
    allDrafts: "1",
    allSent: "2",
    trash: "3",
    spam: "4",
    allmail: "5",
    starred: "10",
    archive: "6",
    sent: "7",
    drafts: "8",
    search: "search",
    label: "label",
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
