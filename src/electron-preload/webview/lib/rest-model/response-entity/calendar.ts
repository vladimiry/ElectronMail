import {Entity} from "src/electron-preload/webview/lib/rest-model/response-entity/base";

export interface Calendar extends Entity {
    Name: string;
    Description: string;
    Color: string;
    Display: number;
}

export interface CalendarAlarm extends Entity {
    Occurrence: number;
    Action: number;
    EventID: CalendarEvent["ID"];
    MemberID: CalendarMember["ID"];
    CalendarID: Calendar["ID"];
}

export interface CalendarEventItem {
    Type: number;
    Data: string;
    Signature: string;
}

export interface CalendarEvent extends Entity {
    CalendarID: Calendar["ID"];
    // CalendarKeyPacket?: null;
    CreateTime: number;
    LastEditTime: number;
    Author: string; // unencrypted email
    // Permissions: number;
    // SharedKeyPacket: string;
    // Attendees: any[]; // TODO TS proton model
    // AttendeesEvent: any[]; // TODO TS proton model
    SharedEvents: CalendarEventItem[];
    CalendarEvents: CalendarEventItem[];
    PersonalEvent: Array<CalendarEventItem & { MemberID: CalendarMember["ID"] }>;
}

export interface CalendarMember extends Entity {
    Permissions: number;
    Email: string; // dev console: unencrypted
}

// export interface CalendarUserSettings {
//     WeekStart: number;
//     WeekLength: number;
//     DisplayWeekNumber: number;
//     DateFormat: number;
//     TimeFormat: number;
//     AutoDetectPrimaryTimezone: number;
//     PrimaryTimezone: string;
//     DisplaySecondaryTimezone: number;
//     SecondaryTimezone?: string;
//     ViewPreference: number;
// }

// TODO move below code to "src/electron-preload/webview/protonmail/api"

// TODO review https://github.com/ProtonMail/proton-calendar/doc

// eslint-disable-next-line max-len
// TODO explore CalendarEvent decryption here https://github.com/ProtonMail/proton-calendar/blob/e08716488589407643d96fe784d7933b92e556a5/src/app/containers/calendar/useCalendarsEvents.js#L333
// export interface CalendarEvent_ extends Entity {
//     // https://github.com/ProtonMail/proton-shared/blob/6068a669a5d0f36d93714d0efa6845f3abcda994/lib/calendar/helper.js#L5
//     uid: string;
//     dtstamp: CalendarDateProp;
//     dtstart?: CalendarDateProp;
//     dtend?: CalendarDateProp;
//     rrule?: "";
//     transp?: "";
//     vtimezone?: "";
//     created?: "";
//     description?: "";
//     summary?: "";
//     location?: "";
//     comment?: "";
//     attendee?: "";
// }

// https://github.com/ProtonMail/proton-shared/blob/6068a669a5d0f36d93714d0efa6845f3abcda994/lib/calendar/veventHelper.js#L45-L54
// export interface CalendarDateProp {
//     value: {
//         year: number;
//         month: number;
//         day: number;
//         hours: number;
//         minutes: number;
//         seconds: number;
//         isUTC: boolean;
//     };
//     parameters?: {
//         type?: "date-time";
//         tzid?: string; // time zone
//     };
// }
