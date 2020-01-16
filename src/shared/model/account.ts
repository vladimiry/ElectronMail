export type AccountConfig = NoExtraProperties<{
    login: string;
    title?: string;
    entryUrl: string;
    database?: boolean; // TODO proton-v4: rename AccountConfig.database => AccountConfig.localStore
    localCalendarStore?: boolean;
    credentials: NoExtraProperties<Partial<Record<"password" | "twoFactorCode" | "mailPassword", string>>>;
    proxy?: NoExtraProperties<{
        proxyRules?: string;
        proxyBypassRules?: string;
    }>;
    loginDelayUntilSelected?: boolean;
    loginDelaySecondsRange?: NoExtraProperties<{ start: number; end: number; }>;
}>;

export type Notifications = NoExtraProperties<{
    calendarLoggedIn: boolean;
    loggedIn: boolean;
    pageType: { url?: string; type: "unknown" | "login" | "login2fa" | "unlock"; };
    unread: number;
}>;

export type NotificationsCalendar = NoExtraProperties<{
    loggedIn: boolean;
}>;
