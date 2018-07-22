import {BaseEntity, Id, IdTuple, RequestParams, TypeRef} from "./model";
import {Omit} from "src/shared/types";

import * as Model from "./model";
import {resolveWebClientApi} from "src/electron-preload/webview/tutanota/lib/tutanota-api";

export async function fetchEntity<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    id: Id | IdTuple,
): Promise<T> {
    const {load} = (await resolveWebClientApi())["src/api/main/Entity"];
    return load(typeRef, id);
}

export async function fetchEntitiesList<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: Id,
): Promise<T[]> {
    const {loadAll} = (await resolveWebClientApi())["src/api/main/Entity"];
    return loadAll(typeRef, listId);
}

export async function fetchEntitiesRange<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: Id,
    queryParams: Required<Omit<RequestParams, "ids">>,
): Promise<T[]> {
    const {loadRange} = (await resolveWebClientApi())["src/api/main/Entity"];
    return loadRange(typeRef, listId, queryParams.start, queryParams.count, queryParams.reverse);
}

export {
    Model,
};
