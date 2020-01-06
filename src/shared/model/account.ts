// TODO drop "AccountType" model as there is no multi providers support anymore
export type AccountType = "protonmail";

export interface GenericAccountConfig<Type extends AccountType, CredentialFields extends string> {
    type: Type;
    login: string;
    title?: string;
    entryUrl: string;
    database?: boolean; // TODO proton-v4: rename AccountConfig.database => AccountConfig.localStore
    localCalendarStore?: boolean;
    credentials: Partial<Record<CredentialFields, string>>;
    proxy?: {
        proxyRules?: string;
        proxyBypassRules?: string;
    };
    loginDelayUntilSelected?: boolean;
    loginDelaySecondsRange?: { start: number; end: number; };
}

export type AccountConfigProton = GenericAccountConfig<"protonmail", "password" | "twoFactorCode" | "mailPassword">;

export type AccountConfig<T extends AccountType = AccountType> = Extract<AccountConfigProton, { type: T }>;

export interface NotificationsProton {
    calendarLoggedIn: boolean;
    loggedIn: boolean;
    pageType: { url?: string; type: "unknown" | "login" | "login2fa" | "unlock"; };
    unread: number;
}

export type Notifications = NotificationsProton;

export interface NotificationsCalendar {
    loggedIn: boolean;
}
