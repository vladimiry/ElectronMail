import {AccountConfig} from "src/shared/model/account";

export type LoginFieldContainer = Pick<AccountConfig, "login">;

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

export type AccountConfigCreateUpdatePatch = NoExtraProperties<Pick<AccountConfig,
    "login" | "title" | "entryUrl" | "database" | "credentials" | "proxy" | "loginDelayUntilSelected" | "loginDelaySecondsRange">>;
