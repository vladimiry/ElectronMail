import {Model, Service} from "pubsub-to-stream-api";
// tslint:disable-next-line:no-unused-variable
import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";

import {
    AccountConfigPatch,
    KeePassClientConfFieldContainer,
    KeePassRefFieldContainer,
    LoginFieldContainer,
    MessageFieldContainer,
    NewPasswordFieldContainer,
    PasswordFieldContainer,
    UrlFieldContainer,
} from "_shared/model/container";
// tslint:disable-next-line:no-unused-variable
import {ElectronContextLocations} from "_shared/model/electron";
import {BaseConfig, Config, Settings} from "_shared/model/options";

export interface Endpoints {
    addAccount: Model.Action<AccountConfigPatch, Settings>;
    associateSettingsWithKeePass: Model.Action<UrlFieldContainer, Settings>;
    changeMasterPassword: Model.Action<PasswordFieldContainer & NewPasswordFieldContainer, Settings>;
    init: Model.Action<undefined, { electronLocations: ElectronContextLocations; hasSavedPassword: boolean; }>;
    // tslint:disable-next-line:max-line-length
    keePassRecordRequest: Model.Action<KeePassRefFieldContainer & KeePassClientConfFieldContainer & { suppressErrors: boolean }, Partial<PasswordFieldContainer & MessageFieldContainer>>;
    logout: Model.Action<undefined, never>;
    openAboutWindow: Model.Action<undefined, never>;
    openExternal: Model.Action<{ url: string }, never>;
    openSettingsFolder: Model.Action<undefined, never>;
    patchBaseSettings: Model.Action<BaseConfig, Config>;
    quit: Model.Action<undefined, never>;
    readConfig: Model.Action<undefined, Config>;
    readSettings: Model.Action<PasswordFieldContainer & { savePassword?: boolean; supressErrors?: boolean }, Settings>;
    readSettingsAuto: Model.Action<undefined, Settings | never>;
    reEncryptSettings: Model.Action<PasswordFieldContainer & { encryptionPreset: EncryptionAdapterOptions }, Settings>;
    removeAccount: Model.Action<LoginFieldContainer, Settings>;
    settingsExists: Model.Action<undefined, boolean>;
    toggleBrowserWindow: Model.Action<{ forcedState?: boolean }, never>;
    toggleCompactLayout: Model.Action<undefined, Config>;
    updateAccount: Model.Action<AccountConfigPatch, Settings>;
    updateOverlayIcon: Model.Action<{ count: number; dataURL?: string; }, never>;
}

// TODO pick prefix from "package.json => name"
export const ipcMainChannel = "protonmail-desktop-app:ipcMain-api";

export const ipcMainStreamService = new Service<Endpoints>({channel: ipcMainChannel});
