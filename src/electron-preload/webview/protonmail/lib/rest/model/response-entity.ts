import {CONTACT_CARD, ENCRYPTED_STATUS, EVENT_ACTION, LABEL_TYPE, LOCATION, MAIL_TYPE} from "./constats";
import {Id, NumberBoolean} from "./common";
import {Unpacked} from "src/shared/types";

export interface Entity {
    ID: Id;
}

export interface Context {
    ContextNumAttachments: number;
    ContextNumMessages: number;
    ContextNumUnread: number;
    ContextSize: number;
    ContextTime: number;
}

export interface Label<TypeRecord = typeof LABEL_TYPE._.nameValueMap> extends Entity {
    Color: string;
    Display: NumberBoolean;
    Exclusive: NumberBoolean;
    Name: string;
    Notify: NumberBoolean;
    Order: number;
    Type: TypeRecord[keyof TypeRecord];
}

export interface MailAddress {
    Address: string;
    Group?: string;
    Name: string;
}

export interface Conversation extends Entity {
    ExpirationTime: number;
    LabelIDs: string[];
    Labels: Array<Context & { ID: Label["ID"] }>;
    NumAttachments: number;
    NumMessages: number;
    NumUnread: number;
    Order: number;
    Recipients: MailAddress[];
    Senders: MailAddress[];
    Size: number;
    Subject: string;
}

export interface Message<TypeRecord = typeof MAIL_TYPE._.nameValueMap,
    LocationRecord = typeof LOCATION._.nameValueMap,
    IsEncryptedRecord = typeof ENCRYPTED_STATUS._.nameValueMap> extends Entity {
    AddressID: Id;
    Attachments: Attachment[];
    BCCList: MailAddress[];
    Body: string;
    CCList: MailAddress[];
    ConversationID: Conversation["ID"];
    ExpirationTime: number;
    ExternalID: string;
    Header: string;
    IsEncrypted: IsEncryptedRecord[keyof IsEncryptedRecord];
    IsForwarded: NumberBoolean;
    IsRead: NumberBoolean;
    IsReplied: NumberBoolean;
    IsRepliedAll: NumberBoolean;
    LabelIDs: string[];
    Location: LocationRecord[keyof LocationRecord];
    MIMEType: string;
    NumAttachments: number;
    Order: number;
    ParsedHeaders: Record<string, string>;
    ReplyTo: MailAddress;
    ReplyTos: MailAddress[];
    Sender: MailAddress;
    SenderAddress: MailAddress["Address"];
    SenderName: MailAddress["Name"];
    Size: number;
    SpamScore: number;
    Starred: NumberBoolean;
    Subject: string;
    Time: number;
    ToList: MailAddress[];
    Type: TypeRecord[keyof TypeRecord];
    Unread: NumberBoolean;
}

export interface Attachment extends Entity {
    Headers: Record<string, string>;
    KeyPackets: string;
    MIMEType: string;
    Name: string;
    Signature: string | null;
    Size: number;
}

export interface Contact extends Entity {
    Cards: ContactCard[];
    ContactEmails?: ContactEmail[];
    CreateTime: number;
    LabelIDs: string[];
    ModifyTime: number;
    Name: string;
    Size: number;
    UID: string;
}

export interface ContactEmail extends Entity {
    ContactID: string;
    Defaults: number;
    Email: string;
    LabelIDs: string[];
    Order: number;
    Type: Array<Unpacked<[
        "acquaintance",
        "agent",
        "cell",
        "child",
        "co-resident",
        "co-worker",
        "colleague",
        "contact",
        "crush",
        "date",
        "emergency",
        "fax",
        "friend",
        "home",
        "iana-token",
        "kin",
        "me",
        "met",
        "muse",
        "neighbor",
        "pager",
        "parent",
        "sibling",
        "spouse",
        "sweetheart",
        "text",
        "textphone",
        "video",
        "voice",
        "work",
        "x-name"
        ]>>;
}

export interface ContactCard<TypeRecord = typeof CONTACT_CARD._.nameValueMap> {
    Data: string;
    Signature: string | null;
    Type: TypeRecord[keyof TypeRecord];
}

export interface Event<TypeRecord = typeof EVENT_ACTION._.nameValueMap, A = TypeRecord[keyof TypeRecord]> {
    EventID: Id;
    Refresh: number; // bitmask, 255 means throw out client cache and reload everything from server, 1 is mail, 2 is contacts
    More: number; // 1 if more events exist and should be fetched
    Messages?: Array<{ Action: A } & Pick<Message, "ID">>;
    Contacts?: Array<{ Action: A } & Pick<Contact, "ID">>;
    ContactEmails?: Array<{ Action: A } & Pick<ContactEmail, "ID">>;
    Labels?: Array<{ Action: A } & Pick<Label, "ID">>;
    MessageCounts?: Array<{ LabelID: string; Unread: number; }>;
}
