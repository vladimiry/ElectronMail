import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";
import {AccountConfig} from "_shared/model/account";
import {Settings} from "_shared/model/options";

export interface AppVersionFieldContainer {
    appVersion: string;
}

export interface KeePassRefFieldContainer {
    keePassRef: KeePassRef;
}

export interface KeePassClientConfFieldContainer {
    keePassClientConf: KeePassClientConf;
}

export interface UrlFieldContainer {
    url: string;
}

export interface SettingsFieldContainer {
    settings: Settings;
}

export interface MessageFieldContainer {
    message: string;
}

export interface LoginFieldContainer {
    login: string;
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

export interface AccountFieldContainer {
    account: AccountConfig;
}

export interface PasswordChangeContainer extends PasswordFieldContainer, NewPasswordFieldContainer {}

export interface AccountConfigPatch extends LoginFieldContainer {
    twoFactorCodeValue?: string;
    passwordValue?: string;
    passwordKeePassRef?: KeePassRef | null;
    mailPasswordValue?: string;
    mailPasswordKeePassRef?: KeePassRef | null;
}
