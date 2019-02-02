import {PROTONMAIL_MAILBOX_IDENTIFIERS} from "src/shared/model/database";
import {buildEnumBundle} from "src/shared/util";

export const PROTONMAIL_MAILBOX_ROUTE_NAMES = buildEnumBundle({
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Inbox]: "inbox",
    [PROTONMAIL_MAILBOX_IDENTIFIERS["All Drafts"]]: "allDrafts",
    [PROTONMAIL_MAILBOX_IDENTIFIERS["All Sent"]]: "allSent",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Trash]: "trash",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Spam]: "spam",
    [PROTONMAIL_MAILBOX_IDENTIFIERS["All Mail"]]: "allmail",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Starred]: "starred",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Archive]: "archive",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Sent]: "sent",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Drafts]: "drafts",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Search]: "search",
    [PROTONMAIL_MAILBOX_IDENTIFIERS.Label]: "label",
});
