import * as Rest from "./rest";
import {StatusCodeError} from "src/shared/model/error";
import {Timestamp} from "src/shared/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";

type ModuleFiles =
    | "src/api/common/EntityFunctions"
    | "src/api/common/TutanotaConstants"
    | "src/api/common/utils/Encoding"
    | "src/api/main/Entity"
    | "src/api/main/EntityEventController";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[lib/provider-api]");
const domContentLoadedPromise = new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve());
});

class EntityEventController {
    notificationReceived(entityUpdates: Rest.Model.EntityUpdate[]): void {}
}

interface ProviderApi extends Record<ModuleFiles, any> {
    "src/api/common/EntityFunctions": {
        GENERATED_MIN_ID: Rest.Model.Id;
        GENERATED_MAX_ID: Rest.Model.Id;
        resolveTypeReference: <T extends Rest.Model.BaseEntity<Rest.Model.Id | Rest.Model.IdTuple>>(
            typeRef: Rest.Model.TypeRef<T>,
        ) => Promise<{ type: "ELEMENT_TYPE" | "LIST_ELEMENT_TYPE" | "DATA_TRANSFER_TYPE" | "AGGREGATED_TYPE"; version: string; }>;
    };
    "src/api/common/TutanotaConstants": {
        FULL_INDEXED_TIMESTAMP: Timestamp;
    };
    "src/api/common/utils/Encoding": {
        timestampToGeneratedId: (timestamp: Timestamp) => Rest.Model.Id;
        generatedIdToTimestamp: (id: Rest.Model.Id) => Timestamp;
    };
    "src/api/main/Entity": {
        loadRoot: <T extends Rest.Model.BaseEntity<Rest.Model.Id/* | Rest.Model.IdTuple*/>, TypeRefType extends Rest.Model.TypeRef<T>>(
            typeRef: Rest.Model.TypeRef<T>,
            groupId: Rest.Model.GroupMembership["group"],
        ) => Promise<T>;
        load: <T extends Rest.Model.BaseEntity<Rest.Model.Id | Rest.Model.IdTuple>, TypeRefType extends Rest.Model.TypeRef<T>>(
            typeRef: Rest.Model.TypeRef<T>,
            id: T["_id"],
        ) => Promise<T>;
        loadAll: <T extends Rest.Model.BaseEntity<Rest.Model.IdTuple>, TypeRefType extends Rest.Model.TypeRef<T>>(
            typeRef: Rest.Model.TypeRef<T>,
            listId: T["_id"][0],
        ) => Promise<T[]>;
        loadMultiple: <T extends Rest.Model.BaseEntity<Rest.Model.Id | Rest.Model.IdTuple>, TypeRefType extends Rest.Model.TypeRef<T>>(
            typeRef: Rest.Model.TypeRef<T>,
            listId: T["_id"] extends Rest.Model.IdTuple ? T["_id"][0] : null,
            instanceIds: Array<T["_id"] extends Rest.Model.IdTuple ? T["_id"][1] : T["_id"]>,
        ) => Promise<T[]>;
        loadRange: <T extends Rest.Model.BaseEntity<Rest.Model.IdTuple>, TypeRefType extends Rest.Model.TypeRef<T>>(
            typeRef: Rest.Model.TypeRef<T>,
            listId: T["_id"][0],
            start: Rest.Model.Id,
            count: number,
            reverse: boolean,
        ) => Promise<T[]>;
    };
    "src/api/main/EntityEventController": {
        EntityEventController: typeof EntityEventController;
    };
}

const state: { bundle?: ProviderApi } = {};

export async function resolveProviderApi(): Promise<ProviderApi> {
    if (state.bundle) {
        return state.bundle;
    }

    _logger.info("resolveProviderApi");

    if (!navigator.onLine) {
        throw new StatusCodeError(`"resolveProviderApi" failed due to the offline status`, "NoNetworkConnection");
    }

    // TODO reject with timeout
    await domContentLoadedPromise;

    const {SystemJS} = window;
    const baseURL = String(SystemJS.getConfig().baseURL).replace(/(.*)\/$/, "$1");
    const bundle: Record<keyof ProviderApi, any> = {
        "src/api/common/EntityFunctions": null,
        "src/api/common/TutanotaConstants": null,
        "src/api/common/utils/Encoding": null,
        "src/api/main/Entity": null,
        "src/api/main/EntityEventController": null,
    };

    for (const key of Object.keys(bundle) as Array<keyof ProviderApi>) {
        bundle[key] = await SystemJS.import(`${baseURL}/${key}.js`);
    }

    state.bundle = bundle as ProviderApi;

    // TODO validate types of all the described constants/functions in a declarative way
    // so app gets tutanota breaking changes noticed on early stage
    if (typeof bundle["src/api/common/EntityFunctions"].GENERATED_MIN_ID !== "string") {
        throw new Error(`Invalid "src/api/common/EntityFunctions.GENERATED_MIN_ID" value`);
    }
    if (typeof bundle["src/api/common/EntityFunctions"].GENERATED_MAX_ID !== "string") {
        throw new Error(`Invalid "src/api/common/EntityFunctions.GENERATED_MAX_ID" value`);
    }
    if (typeof bundle["src/api/common/TutanotaConstants"].FULL_INDEXED_TIMESTAMP !== "number") {
        throw new Error(`Invalid "src/api/common/TutanotaConstants.FULL_INDEXED_TIMESTAMP" value`);
    }

    return state.bundle;
}
