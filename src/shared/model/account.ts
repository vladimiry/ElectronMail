import {KeePassRef} from "./keepasshttp";

export type AccountType = "protonmail" | "tutanota";

export interface GenericAccountConfig<Type extends AccountType, CredentialFields extends string> {
    type: Type;
    login: string;
    entryUrl: string;
    storeMails?: boolean;
    credentials: Partial<Record<CredentialFields, string>>;
    credentialsKeePass: Partial<Record<CredentialFields, KeePassRef>>;
}

export interface GenericNotifications<NotificationPageTypes extends string = string> {
    loggedIn: boolean;
    unread: number;
    pageType: { url?: string; type: NotificationPageTypes; };
}

export type AccountConfigProtonmail = GenericAccountConfig<"protonmail", "password" | "twoFactorCode" | "mailPassword">;
export type NotificationsProtonmail = GenericNotifications<"unknown" | "login" | "login2fa" | "unlock">;

export type AccountConfigTutanota = GenericAccountConfig<"tutanota", "password" | "twoFactorCode">;
export type NotificationsTutanota = GenericNotifications<"unknown" | "login" | "login2fa">;

export type AccountConfig<T extends AccountType = AccountType> = Extract<AccountConfigProtonmail | AccountConfigTutanota, { type: T }>;

export type Notifications = NotificationsProtonmail | NotificationsTutanota;
