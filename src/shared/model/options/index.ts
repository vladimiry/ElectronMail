import {Model as StoreModel} from "fs-json-store";

import {Options as EncryptionAdapterOptions} from "fs-json-store-encryption-adapter";
import {KeePassClientConfFieldContainer, KeePassRefFieldContainer} from "_shared/model/container";
import {AccountConfig} from "_shared/model/account";

export interface Config extends Partial<StoreModel.StoreEntity> {
    encryptionPreset: EncryptionAdapterOptions;
    startMinimized?: boolean;
    compactLayout?: boolean;
    closeToTray?: boolean;
    unreadNotifications?: boolean;
    window: {
        maximized?: boolean;
        bounds: { x?: number; y?: number; width: number; height: number; };
    };
}

export interface Settings extends Partial<StoreModel.StoreEntity>,
    Partial<KeePassClientConfFieldContainer>,
    Partial<KeePassRefFieldContainer> {
    accounts: AccountConfig[];
}

export const settingsAccountLoginUniquenessValidator: StoreModel.StoreValidator<Settings> = async (data) => {
    const duplicatedLogins = data.accounts
        .map((account) => account.login)
        .reduce((duplicated: string[], el, i, logins) => {
            if (logins.indexOf(el) !== i && duplicated.indexOf(el) === -1) {
                duplicated.push(el);
            }
            return duplicated;
        }, []);
    const result = duplicatedLogins.length
        ? `Duplicate accounts identified. Duplicated logins: ${duplicatedLogins.join(", ")}.`
        : null;

    return Promise.resolve(result);
};
