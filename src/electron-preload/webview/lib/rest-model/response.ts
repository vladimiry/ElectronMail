import {CalendarEvent, CalendarMember} from "src/electron-preload/webview/lib/rest-model/response-entity/calendar";
import {Contact, Context, Conversation, Message} from "src/electron-preload/webview/lib/rest-model/response-entity/mail";
import {Event} from "src/electron-preload/webview/lib/rest-model/response-entity/event";
import {Label} from "src/electron-preload/webview/lib/rest-model/response-entity/folder";
import {NumberBoolean} from "src/electron-preload/webview/lib/rest-model/common";

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
    Messages: Array<StrictOmit<Message,
        | "Attachments"
        | "Body"
        | "Header"
        | "MIMEType"
        | "ParsedHeaders"
        | "ReplyTo"
        | "ReplyTos"
        | "SpamScore"> &
        { HasAttachment: NumberBoolean }>;
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

// GET https://beta.protonmail.com/api/calendars/<Calendar.ID>/members
export interface CalendarMembersResponse {
    Members: CalendarMember[];
}

// GET https://beta.protonmail.com/api/calendars/<Calendar.ID>/events?Start=&End=&Timezone=&PageSize=100&Page=0
export interface CalendarEvents {
    Events: CalendarEvent[];
}

// GET https://beta.protonmail.com/api/calendars/<Calendar.ID>/alarms?Start=&End=&PageSize=100
export interface CalendarAlarms {
    Alarms: CalendarAlarms[];
}

export type LatestEventResponse = Event["EventID"];

export interface EventResponse extends Response, Event {}
