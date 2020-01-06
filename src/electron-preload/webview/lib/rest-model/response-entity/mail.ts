import {CONTACT_CARD, ENCRYPTED_STATUS, LOCATION, MAIL_TYPE} from "src/electron-preload/webview/lib/rest-model/constats";
import {Entity} from "src/electron-preload/webview/lib/rest-model/response-entity/base";
import {Id, NumberBoolean} from "src/electron-preload/webview/lib/rest-model/common";
import {Label} from "src/electron-preload/webview/lib/rest-model/response-entity/folder";

export interface Context {
    ContextNumAttachments: number;
    ContextNumMessages: number;
    ContextNumUnread: number;
    ContextSize: number;
    ContextTime: number;
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
