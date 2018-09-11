import {Contact, ConversationEntry, Folder, Mail} from "src/shared/model/database";

// TODO consider wiring-up "zoneName" into the all API calls automatically, hiding a complexity (encapsulating)
export interface ZoneApiParameter {
    zoneName: string;
}

export interface BatchEntityUpdatesDbPatch {
    conversationEntries: { remove: Array<Pick<ConversationEntry, "pk">>; upsert: ConversationEntry[]; };
    mails: { remove: Array<Pick<Mail, "pk">>; upsert: Mail[]; };
    folders: { remove: Array<Pick<Folder, "pk">>; upsert: Folder[]; };
    contacts: { remove: Array<Pick<Contact, "pk">>; upsert: Contact[]; };
}
