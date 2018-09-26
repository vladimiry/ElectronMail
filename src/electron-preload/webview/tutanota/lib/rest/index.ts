import * as Model from "./model";
import * as Util from "./util";
import {BaseEntity, Id, IdTuple, RequestParams, TypeRef} from "./model";
import {Omit} from "src/shared/types";
import {StatusCodeError} from "src/shared/model/error";
import {resolveApi} from "src/electron-preload/webview/tutanota/lib/api";
import {resolveInstanceId} from "src/electron-preload/webview/tutanota/lib/rest/util";

export async function fetchEntity<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    id: T["_id"],
): Promise<T> {
    if (!navigator.onLine) {
        throw new StatusCodeError(`"fetchEntity" failed due to the offline status`, "NoNetworkConnection");
    }
    const {load} = (await resolveApi())["src/api/main/Entity"];
    return load(typeRef, id);
}

export async function fetchEntities<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
): Promise<T[]> {
    if (!navigator.onLine) {
        throw new StatusCodeError(`"fetchEntitiesList" failed due to the offline status`, "NoNetworkConnection");
    }
    const {loadAll} = (await resolveApi())["src/api/main/Entity"];
    return loadAll(typeRef, listId);
}

// TODO "fetchMultipleEntities": allow optional fetching by chunks/portions, "chinkSize" argument
export async function fetchMultipleEntities<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"] extends IdTuple ? T["_id"][0] : null,
    instanceIds: Array<T["_id"] extends IdTuple ? T["_id"][1] : T["_id"]>,
): Promise<T[]> {
    if (!navigator.onLine) {
        throw new StatusCodeError(`"fetchEntitiesList" failed due to the offline status`, "NoNetworkConnection");
    }
    const {loadMultiple} = (await resolveApi())["src/api/main/Entity"];
    return loadMultiple(typeRef, listId, instanceIds);
}

export async function fetchEntitiesRange<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
    queryParams: Required<Omit<RequestParams, "ids">>,
): Promise<T[]> {
    if (!navigator.onLine) {
        throw new StatusCodeError(`"fetchEntitiesRange" failed due to the offline status`, "NoNetworkConnection");
    }
    const {loadRange} = (await resolveApi())["src/api/main/Entity"];
    return loadRange(typeRef, listId, queryParams.start, queryParams.count, queryParams.reverse);
}

export async function fetchEntitiesRangeUntilTheEnd<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
    {start, count}: Required<Omit<RequestParams, "ids" | "reverse">>,
): Promise<T[]> {
    if (!navigator.onLine) {
        throw new StatusCodeError(`"fetchEntitiesRangeUntilTheEnd" failed due to the offline status`, "NoNetworkConnection");
    }

    count = Math.max(1, Math.min(count, 500));

    const {timestampToGeneratedId, generatedIdToTimestamp} = (await resolveApi())["src/api/common/utils/Encoding"];
    const entities = await fetchEntitiesRange(typeRef, listId, {start, count, reverse: false});
    const fullPortionFetched = entities.length === count;

    if (fullPortionFetched) {
        const lastEntity = entities[entities.length - 1];
        const currentPortionEndId = resolveInstanceId(lastEntity);
        const currentPortionEndTimestamp = generatedIdToTimestamp(currentPortionEndId);
        const nextPortionStartId = timestampToGeneratedId(currentPortionEndTimestamp + 1);

        entities.push(
            ...await fetchEntitiesRangeUntilTheEnd(typeRef, listId, {start: nextPortionStartId, count}),
        );
    }

    return entities;
}

export {
    Model,
    Util,
};
