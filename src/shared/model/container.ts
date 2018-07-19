import {AccountConfig, AccountType} from "src/shared/model/account";
import {KeePassClientConf, KeePassRef} from "src/shared/model/keepasshttp";

export interface KeePassRefFieldContainer {
    keePassRef: KeePassRef;
}

export interface KeePassClientConfFieldContainer {
    keePassClientConf: KeePassClientConf;
}

export interface UrlFieldContainer {
    url: string;
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

export interface PasswordChangeContainer extends PasswordFieldContainer, NewPasswordFieldContainer {}

export type AccountConfigCreatePatch<Type extends AccountType = AccountType> = AccountConfig<Type>;

export type AccountConfigUpdatePatch<Type extends AccountType = AccountType> = Pick<AccountConfig<Type>, "login">
    & Partial<Pick<AccountConfig<Type>, "login" | "entryUrl" | "storeMails" | "credentials" | "credentialsKeePass">>;
