export type AccountType = "tutanota";

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

export type AccountConfigTutanota = GenericAccountConfig<"tutanota", "password" | "twoFactorCode">;
export type AccountConfig<T extends AccountType = AccountType> = Extract<AccountConfigTutanota, { type: T }>;

export interface GenericNotifications<NotificationPageTypes extends string = string> {
    title: string;
    loggedIn: boolean;
    unread: number;
    pageType: { url?: string; type: NotificationPageTypes; };
}

export type NotificationsTutanota = GenericNotifications<"unknown" | "login" | "login2fa">;
export type Notifications = NotificationsTutanota;
