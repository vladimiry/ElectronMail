import type {Model as StoreModel} from "fs-json-store";

import type {AccountPersistentSessionBundle} from "src/shared/model/account";

export type SessionStorageModel = Partial<StoreModel.StoreEntity> & NoExtraProps<{
    version?: number
    dataSaltBase64?: string;
    instance: Record<string /* mapped by "login" */, AccountPersistentSessionBundle | undefined>
}>;
