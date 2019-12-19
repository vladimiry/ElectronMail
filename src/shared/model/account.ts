export type AccountType = "protonmail";

export interface GenericAccountConfig<Type extends AccountType, CredentialFields extends string> {
    type: Type;
    login: string;
    title?: string;
    entryUrl: string;
    database?: boolean;
    credentials: Partial<Record<CredentialFields, string>>;
    proxy?: {
        proxyRules?: string;
        proxyBypassRules?: string;
    };
    loginDelayUntilSelected?: boolean;
    loginDelaySecondsRange?: { start: number; end: number; };
}

export type AccountConfigProtonmail = GenericAccountConfig<"protonmail", "password" | "twoFactorCode" | "mailPassword">;
export type AccountConfig<T extends AccountType = AccountType> = Extract<AccountConfigProtonmail, { type: T }>;

export interface GenericNotifications<NotificationPageTypes extends string = string> {
    title: string;
    loggedIn: boolean;
    unread: number;
    pageType: { url?: string; type: NotificationPageTypes; };
}

export type NotificationsProtonmail = GenericNotifications<"unknown" | "login" | "login2fa" | "unlock">;
export type Notifications = NotificationsProtonmail;
