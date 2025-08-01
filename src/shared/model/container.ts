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

export type AccountConfigCreateUpdatePatch = NoExtraProps<
    Pick<
        AccountConfig,
        | "customNotification"
        | "customNotificationCode"
        | "notificationShellExec"
        | "notificationShellExecCode"
        | "customCSS"
        | "credentials"
        | "database"
        | "localStoreViewByDefault"
        | "entryUrl"
        | "blockNonEntryUrlBasedRequests2"
        | "externalContentProxyUrlPattern"
        | "enableExternalContentProxy"
        | "login"
        | "loginDelaySecondsRange"
        | "loginDelayUntilSelected"
        | "persistentSession"
        | "customUserAgent"
        | "proxy"
        | "title"
        | "entryProtonApp"
    >
>;
