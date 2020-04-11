import {AccountConfig} from "src/shared/model/account";

export type LoginFieldContainer = Pick<AccountConfig, "login">;

export interface ApiEndpointOriginFieldContainer {
    apiEndpointOrigin: string;
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

export type AccountConfigCreateUpdatePatch = NoExtraProperties<Pick<AccountConfig,
    | "credentials"
    | "database"
    | "entryUrl"
    | "login"
    | "loginDelaySecondsRange"
    | "loginDelayUntilSelected"
    | "persistentSession"
    | "rotateUserAgent"
    | "proxy"
    | "title">>;
