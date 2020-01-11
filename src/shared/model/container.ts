import {AccountConfig, AccountType} from "src/shared/model/account";

export type AccountTypeAndLoginFieldContainer = Pick<AccountConfig, "type" | "login">;

export type LoginFieldContainer = Pick<AccountTypeAndLoginFieldContainer, "login">;

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

export type AccountConfigCreatePatch<T extends AccountType = AccountType> = NoExtraProperties<Pick<AccountConfig<T>,
    "type" | "login" | "title" | "entryUrl" | "database" | "credentials" | "proxy" | "loginDelayUntilSelected" | "loginDelaySecondsRange">>;

export type AccountConfigUpdatePatch<T extends AccountType = AccountType> =
    NoExtraProperties<Pick<AccountConfigCreatePatch<T>, "login"> & Partial<Skip<AccountConfigCreatePatch<T>, "type" | "login">>>;
