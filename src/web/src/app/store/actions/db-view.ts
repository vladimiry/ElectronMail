import {ofType, unionize} from "unionize";

import {DbAccountPk} from "src/shared/model/database";
import {Instance} from "src/web/src/app/store/reducers/db-view";

export const DB_VIEW_ACTIONS = unionize({
        MountInstance: ofType<{ dbAccountPk: DbAccountPk; finishPromise: Promise<void>; }>(),
        UnmountInstance: ofType<{ dbAccountPk: DbAccountPk; }>(),
        PatchInstanceData: ofType<{ dbAccountPk: DbAccountPk; patch: Partial<Instance["data"]> }>(),
        PatchInstanceFilters: ofType<{ dbAccountPk: DbAccountPk; patch: Partial<Instance["filters"]> }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "db-view:",
    },
);
