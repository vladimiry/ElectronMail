import {Contact, Context, Conversation, Message} from "src/electron-preload/webview/lib/rest-model/response-entity/mail";
import {Event} from "src/electron-preload/webview/lib/rest-model/response-entity/event";
import {Label} from "src/electron-preload/webview/lib/rest-model/response-entity/folder";
import {NumericBoolean} from "src/shared/model/common";

export const SUCCESS_RESPONSE = 1000;

export interface Response {
    Code: typeof SUCCESS_RESPONSE | number;
}

export interface ConversationResponse extends Response {
    Conversation: Conversation;
    Messages: Message[];
}

export interface ConversationsResponse extends Response {
    Total: number;
    Limit: number;
    Conversations: Array<Conversation & Context & { Time: number }>;
}

export interface MessageResponse extends Response {
    Message: Message;
}

export interface MessagesResponse extends Response {
    Total: number;
    Limit: number;
    Messages: Array<StrictOmit<Message,
        | "Attachments"
        | "Body"
        | "Header"
        | "MIMEType"
        | "ParsedHeaders"
        | "ReplyTo"
        | "ReplyTos"
        | "SpamScore"> &
        { HasAttachment: NumericBoolean }>;
}

export interface ContactResponse extends Response {
    Contact: Contact;
}

export interface ContactsResponse extends Response {
    Total: number;
    Limit: number;
    Contacts: Array<StrictOmit<Contact, "Cards" | "ContactEmails">>;
}

export interface LabelsResponse extends Response {
    Labels: Label[];
}

export type LatestEventResponse = Response & Pick<Event, "EventID">;

export interface EventResponse extends Response, Event {}
