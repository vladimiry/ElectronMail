import type {Model as StoreModel} from "fs-json-store";

import type {AccountPersistentSessionBundle, AccountSessionStoragePatchBundle} from "src/shared/model/account";
import type {LoginFieldContainer} from "src/shared/model/container";

export type SessionStorageModel =
    & Partial<StoreModel.StoreEntity>
    & NoExtraProps<
        {
            version?: number;
            dataSaltBase64?: string;
            instance: Record<LoginFieldContainer["login"], AccountPersistentSessionBundle | undefined>;
            sessionStoragePatchInstance: Record<LoginFieldContainer["login"], AccountSessionStoragePatchBundle | undefined>;
        }
    >;
