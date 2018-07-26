import {KeePassRef} from "./keepasshttp";

export type AccountType = "protonmail" | "tutanota";

// @formatter:off
interface GenericWebAccount<
    Type extends AccountType,
    CredentialFields extends string,
    NotificationPageTypes extends string,
    ExtraNotifications extends Partial<Record<string, any>> = {},
> {
    accountConfig: {
        type: Type;
        login: string;
        entryUrl: string;
        storeMails?: boolean;
        credentials: Partial<Record<CredentialFields, string>>;
        credentialsKeePass: Partial<Record<CredentialFields, KeePassRef>>;
    };
    progress: Partial<Record<CredentialFields, boolean>>;
    notifications: {
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
    "unknown" | "login" | "login2fa" | "unlock"
>;

export type WebAccountTutanota = GenericWebAccount<
    "tutanota",
    "password" | "twoFactorCode",
    "unknown" | "login" | "login2fa"
>;

export type WebAccount = WebAccountProtonmail | WebAccountTutanota;
// @formatter:on

export type AccountConfig<Type extends AccountType = AccountType> = Extract<WebAccount["accountConfig"], { type: Type }>;

export type AccountProgress = WebAccount["progress"];

export type AccountNotifications<T extends WebAccount> = T["notifications"];

export type AccountNotificationType<T extends WebAccount = WebAccount, N = AccountNotifications<T>> = { [k in keyof N]: N[k] };
