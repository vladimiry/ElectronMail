import {Folder, Mail} from "src/shared/model/database";

// TODO consider wiring-up "zoneName" into the all API calls automatically, hiding a complexity (encapsulating)
export interface ZoneApiParameter {
    zoneName: string;
}

export interface BatchEntityUpdatesDatabasePatch {
    mails: { remove: Array<Pick<Mail, "pk">>; upsert: Mail[]; };
    folders: { remove: Array<Pick<Folder, "pk">>; upsert: Folder[]; };
}
