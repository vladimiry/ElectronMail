import {Contact, Context, Conversation, Event, Label, Message} from "./response-entity";
import {NumberBoolean} from "./common";

export const SUCCESS_RESPONSE = 1000;

interface Response {
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
    Messages: Array<Omit<Message, "Attachments" | "Body" | "Header" | "MIMEType" | "ParsedHeaders" | "ReplyTo" | "ReplyTos" | "SpamScore"> &
        { HasAttachment: NumberBoolean }>;
}

export interface ContactResponse extends Response {
    Contact: Contact;
}

export interface ContactsResponse extends Response {
    Total: number;
    Limit: number;
    Contacts: Array<Omit<Contact, "Cards" | "ContactEmails">>;
}

export interface LabelsResponse extends Response {
    Labels: Label[];
}

export type LatestEventResponse = Event["EventID"];

export interface EventResponse extends Response, Event {}
