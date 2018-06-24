import {WebAccountPageLocation} from "_@shared/model/account";

export type NotificationType = "noop" | "unauthorized" | "title" | "unread" | "pageType" | "offline";

export interface Notification {
    type: NotificationType;
}

export interface Noop extends Notification {
    type: "noop";
    message?: string;
}

export interface NotAuthorizedNotification extends Notification {
    type: "unauthorized";
}

export interface TitleNotification extends Notification {
    type: "title";
    value: string;
}

export interface UnreadNotification extends Notification {
    type: "unread";
    value: number;
}

export interface PageTypeNotification extends Notification {
    type: "pageType";
    value: WebAccountPageLocation;
}

export interface OfflineNotification extends Notification {
    type: "offline";
}

export type AccountNotificationOutput =
    | Noop
    | NotAuthorizedNotification
    | TitleNotification
    | UnreadNotification
    | PageTypeNotification
    | OfflineNotification;
