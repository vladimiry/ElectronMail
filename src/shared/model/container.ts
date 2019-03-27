import {AccountConfig, AccountType} from "src/shared/model/account";

export type AccountTypeAndLoginFieldContainer = Pick<AccountConfig, "type" | "login">;

export type LoginFieldContainer = Pick<AccountTypeAndLoginFieldContainer, "login">;

export interface UrlFieldContainer {
    url: string;
}

export interface MessageFieldContainer {
    message: string;
}

export interface PasswordFieldContainer {
    password: string;
}

export interface MailPasswordFieldContainer {
    mailPassword: string;
}

export interface NewPasswordFieldContainer {
    newPassword: string;
}

export interface PasswordChangeContainer extends PasswordFieldContainer, NewPasswordFieldContainer {}

export type AccountConfigCreatePatch<T extends AccountType = AccountType> = AccountConfig<T>;

export type AccountConfigUpdatePatch<T extends AccountType = AccountType> = Pick<AccountConfig<T>, "login">
    & Partial<Pick<AccountConfig,
    "login" | "entryUrl" | "database" | "credentials" | "proxy" | "loginDelayOnSelect" | "loginDelaySecondsRange">>;
