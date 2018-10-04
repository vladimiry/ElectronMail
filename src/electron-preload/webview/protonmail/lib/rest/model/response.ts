import {Id, NumberBoolean} from "./common";
import {MAIL_TYPE} from "./constats";

export const SUCCESS_RESPONSE = 1000;

interface Response {
    code: typeof SUCCESS_RESPONSE | number;
}

interface Context {
    ContextNumAttachments: number;
    ContextNumMessages: number;
    ContextNumUnread: number;
    ContextSize: number;
    ContextTime: number;
}

export interface Label extends Context {
    ID: Id;
}

export interface MailAddress {
    Address: string;
    Group?: string;
    Name: string;
}

export interface Conversation {
    ExpirationTime: number;
    ID: Id;
    LabelIDs: string[];
    Labels: Label[];
    NumAttachments: number;
    NumMessages: number;
    NumUnread: number;
    Order: number;
    Recipients: MailAddress[];
    Senders: MailAddress[];
    Size: number;
    Subject: string;
}

export interface Message<TypeRecord = typeof MAIL_TYPE._.nameValueMap> {
    AddressID: Id;
    BCCList: MailAddress[];
    CCList: MailAddress[];
    ConversationID: Conversation["ID"];
    ExpirationTime: number;
    HasAttachment: NumberBoolean;
    ID: Id;
    IsEncrypted: NumberBoolean;
    IsForwarded: NumberBoolean;
    IsRead: NumberBoolean;
    IsReplied: NumberBoolean;
    IsRepliedAll: NumberBoolean;
    LabelIDs: string[];
    Location: number;
    NumAttachments: number;
    Sender: MailAddress;
    SenderAddress: MailAddress["Address"];
    SenderName: MailAddress["Name"];
    Size: number;
    Starred: number;
    Subject: string;
    Time: number;
    ToList: MailAddress[];
    Type: TypeRecord[keyof TypeRecord];
    Unread: NumberBoolean;
}

export interface ConversationResponse extends Response {
    conversation: Conversation;
    messages: Message[];
}

export interface ConversationsResponse extends Response {
    conversations: Array<Conversation & { Time: number } & Context>;
}
