import {Contact, ContactEmail, Message} from "src/electron-preload/webview/lib/rest-model/response-entity/mail";
import {EVENT_ACTION} from "src/electron-preload/webview/lib/rest-model/constats";
import {Id} from "src/electron-preload/webview/lib/rest-model/common";
import {Label} from "src/electron-preload/webview/lib/rest-model/response-entity/folder";
import {SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";

interface EventSubMessage {
    Message?: { LabelIDsAdded?: typeof SYSTEM_FOLDER_IDENTIFIERS._.values };
}

export interface Event<TypeRecord = typeof EVENT_ACTION._.nameValueMap, A = TypeRecord[keyof TypeRecord]> {
    EventID: Id;
    Refresh: number; // bitmask, 255 means throw out client cache and reload everything from server, 1 is mail, 2 is contacts
    More: number; // 1 if more events exist and should be fetched
    Messages?: Array<{ Action: A } & Pick<Message, "ID"> & EventSubMessage>;
    Contacts?: Array<{ Action: A } & Pick<Contact, "ID"> & EventSubMessage>;
    ContactEmails?: Array<{ Action: A } & Pick<ContactEmail, "ID">>;
    Labels?: Array<{ Action: A } & Pick<Label, "ID"> & EventSubMessage>;
    MessageCounts?: Array<{ LabelID: string; Unread: number }>;
}
