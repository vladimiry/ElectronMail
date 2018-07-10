import {BaseResponse, Id, IdTuple, RequestHeaders, RequestParams, TypeRef} from "./model/index";
import {Omit} from "src/shared/types";
import {resolveTypeReference, typeRefToPath} from "_@webview-preload/tutanota/from-tutanota-repo";

export async function get<T extends BaseResponse, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    id: Id<T> | IdTuple<T>,
    entryUrl: string,
    headers: RequestHeaders,
): Promise<T> {
    const state: { listId?: string; elementId?: string; path: string[] } = {
        path: [entryUrl, typeRefToPath(typeRef)],
    };
    const typeModel = await resolveTypeReference(typeRef);

    if (typeModel.type === "LIST_ELEMENT_TYPE") {
        if (!Array.isArray(id) || id.length !== 2) {
            throw new Error(`Illegal IdTuple: ${id}`);
        }
        state.listId = id[0];
        state.elementId = id[1];
    } else if (typeof id === "string") {
        state.elementId = id;
    } else {
        throw new Error(`Illegal Id: ${id}`);
    }

    return request(typeRef, state.listId, state.elementId, entryUrl, headers) as Promise<T>;
}

export async function getRange<T extends BaseResponse, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: Id<T>,
    entryUrl: string,
    headers: RequestHeaders,
    queryParams: Required<Omit<RequestParams, "ids">>,
): Promise<T[]> {
    return request(typeRef, listId, null, entryUrl, headers, queryParams) as Promise<T[]>;
}

async function request<T extends BaseResponse, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: Id | undefined | null,
    elementId: Id | undefined | null,
    entryUrl: string,
    headers: RequestHeaders,
    queryParams?: RequestParams,
): Promise<T | T[]> {
    const {version} = await resolveTypeReference(typeRef);
    const state: { listId?: string; elementId?: string; path: string[] } = {
        path: [entryUrl, typeRefToPath(typeRef)],
    };

    if (listId) {
        state.path.push(`/${listId}`);
    }
    if (elementId) {
        state.path.push(`/${elementId}`);
    }
    if (queryParams) {
        const query = Object
            .entries(queryParams)
            .reduce((list, [name, value]) => list.concat([`${name}=${encodeURIComponent(value)}`]), [] as string[])
            .join("&");
        if (query) {
            state.path.push(`?${query}`);
        }
    }

    const response = await fetch(state.path.join(""), {
        method: "GET",
        cache: "no-cache",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            version,
            ...headers,
        },
    });

    return await response.json();
}
