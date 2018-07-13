import {AccountConfig, AccountConfigByType, AccountType} from "src/shared/model/account";
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

type AccountConfigPatchOptionalFields = "entryUrl" | "credentials" | "credentialsKeePass";

export type AccountConfigPatch
    = Pick<AccountConfig, "login"> & Partial<Pick<AccountConfig, AccountConfigPatchOptionalFields>>;

export type AccountConfigPatchByType<Type extends AccountType>
    = Pick<AccountConfig, "login"> & Pick<AccountConfigByType<Type>, AccountConfigPatchOptionalFields>;

export type AccountConfigCreatePatch = AccountConfigPatch & Pick<AccountConfig, "type">;

export type AccountConfigCreatePatchByType<Type extends AccountType> = AccountConfigByType<Type> & Pick<AccountConfig, "type">;
