import {Contact, ConversationEntry, Folder, Mail} from "src/shared/model/database";

export interface DbPatch {
    // TODO remove "DbPatch.conversationEntries" prop as it was needed for "tutanota" mail provider only
    conversationEntries: {remove: Array<Pick<ConversationEntry, "pk">>; upsert: ConversationEntry[]};
    mails: {remove: Array<Pick<Mail, "pk">>; upsert: Mail[]};
    folders: {remove: Array<Pick<Folder, "pk">>; upsert: Folder[]};
    contacts: {remove: Array<Pick<Contact, "pk">>; upsert: Contact[]};
}
