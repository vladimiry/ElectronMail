import {Contact, Folder, Mail} from "src/shared/model/database";

// TODO consider wiring-up "zoneName" into the all API calls automatically, hiding a complexity (encapsulating)
export interface ZoneApiParameter {
    zoneName: string;
}

export interface BatchEntityUpdatesDbPatch {
    mails: { remove: Array<Pick<Mail, "pk">>; upsert: Mail[]; };
    folders: { remove: Array<Pick<Folder, "pk">>; upsert: Folder[]; };
    contacts: { remove: Array<Pick<Contact, "pk">>; upsert: Contact[]; };
}
