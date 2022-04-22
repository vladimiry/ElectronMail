import {SESSION_STORAGE_VERSION} from "src/electron-main/session-storage/const";
import {SessionStorageModel} from "src/electron-main/session-storage/model";

export const emptySessionStorageEntity = (): SessionStorageModel => {
    return {
        version: SESSION_STORAGE_VERSION,
        instance: {},
        sessionStoragePatchInstance: {},
    };
};
