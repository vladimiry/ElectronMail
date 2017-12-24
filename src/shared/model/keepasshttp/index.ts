import {Model as KeePassHttpClientModel} from "keepasshttp-client";

export interface KeePassRef {
    url: string;
    uuid: string;
}

export interface KeePassClientConf {
    keyId: KeePassHttpClientModel.Common.KeyId;
    url?: string;
}
