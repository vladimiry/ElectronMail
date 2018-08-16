import * as Model from "./model";
import {BaseEntity, Id, IdTuple, RequestParams, TypeRef} from "./model";
import {Omit} from "src/shared/types";
import {resolveInstanceId} from "src/electron-preload/webview/tutanota/lib/util";
import {resolveWebClientApi} from "src/electron-preload/webview/tutanota/lib/tutanota-api";

export async function fetchEntity<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    id: T["_id"],
): Promise<T> {
    const {load} = (await resolveWebClientApi())["src/api/main/Entity"];
    return load(typeRef, id);
}

export async function fetchEntitiesList<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
): Promise<T[]> {
    const {loadAll} = (await resolveWebClientApi())["src/api/main/Entity"];
    return loadAll(typeRef, listId);
}

export async function fetchEntitiesRange<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
    queryParams: Required<Omit<RequestParams, "ids">>,
): Promise<T[]> {
    const {loadRange} = (await resolveWebClientApi())["src/api/main/Entity"];
    return loadRange(typeRef, listId, queryParams.start, queryParams.count, queryParams.reverse);
}

export async function fetchEntitiesRangeUntilTheEnd<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
    {start, count}: Required<Omit<RequestParams, "ids" | "reverse">>,
): Promise<T[]> {
    count = Math.max(1, Math.min(count, 500));

    const {timestampToGeneratedId, generatedIdToTimestamp} = (await resolveWebClientApi())["src/api/common/utils/Encoding"];
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
};
