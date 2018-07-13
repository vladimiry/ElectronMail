import {KeePassRef} from "./keepasshttp";

export type AccountType = "protonmail" | "tutanota";

// @formatter:off
interface GenericWebAccount<
    Type extends AccountType,
    CredFields extends string,
    NotificationPageTypes extends string,
    ExtraNotifications extends Partial<Record<string, any>> = {},
> {
    accountConfig: {
        type: Type;
        login: string;
        entryUrl: string;
        credentials: Partial<Record<CredFields, string>>;
        credentialsKeePass: Partial<Record<CredFields, KeePassRef>>;
    };
    progress: Partial<Record<CredFields, boolean>>;
    notifications: {
        title?: string;
        loggedIn: boolean;
        unread: number;
        pageType: { url?: string; type: NotificationPageTypes; },
    } & ExtraNotifications;
}
// @formatter:on

// @formatter:off
export type WebAccountProtonmail = GenericWebAccount<
    "protonmail",
    "password" | "twoFactorCode" | "mailPassword",
    "undefined" | "login" | "login2fa" | "unlock"
>;

export type WebAccountTutanota = GenericWebAccount<
    "tutanota",
    "password" | "twoFactorCode",
    "undefined" | "login" | "login2fa"
>;

export type WebAccount = WebAccountProtonmail | WebAccountTutanota;
// @formatter:on

export type AccountConfig = WebAccount["accountConfig"];

export type AccountConfigByType<Type extends AccountType> = Extract<AccountConfig, { type: Type }>;

export type AccountProgress = WebAccount["progress"];

export type AccountNotifications<T extends WebAccount> = T["notifications"];

export type AccountNotificationType<T extends WebAccount = WebAccount, N = AccountNotifications<T>> = { [k in keyof N]: N[k] };
