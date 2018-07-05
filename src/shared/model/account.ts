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
    notifications: Partial<{
        title: string;
    }> & {
        unread: number;
    } & {
        pageType: { url?: string; type: NotificationPageTypes; },
    } & ExtraNotifications;
}
// @formatter:on

// @formatter:off
export type WebAccountProtonmail = GenericWebAccount<
    "protonmail",
    "password" | "twoFactorCode" | "mailPassword",
    "login" | "login2fa" | "unlock" | "undefined"
>;

export type WebAccountTutanota = GenericWebAccount<
    "tutanota",
    "password" | "twoFactorCode",
    "login" | "login2fa" | "undefined"
>;

export type WebAccount = WebAccountProtonmail | WebAccountTutanota;
// @formatter:on

export type AccountConfig = WebAccount["accountConfig"];

export type AccountConfigByType<Type extends AccountType> = Extract<AccountConfig, { type: Type }>;

export type AccountProgress = WebAccount["progress"];

export type AccountNotifications = WebAccount["notifications"];

export type AccountNotificationType<T = AccountNotifications> = { [k in keyof T]: T[k] };
