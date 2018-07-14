import {BaseEntity, Id, IdTuple, TypeRef} from "src/electron-preload/webview/tutanota/lib/rest/model/index";
import {Timestamp} from "src/shared/types";

type ModuleFiles =
    | "src/api/common/EntityFunctions"
    | "src/api/common/TutanotaConstants"
    | "src/api/common/utils/Encoding"
    | "src/api/common/WorkerProtocol"
    | "src/api/main/Entity";

export interface WebClientApi extends Record<ModuleFiles, any> {
    "src/api/common/EntityFunctions": {
        GENERATED_MIN_ID: Id;
        GENERATED_MAX_ID: Id;
        resolveTypeReference: <T extends BaseEntity>(
            typeRef: TypeRef<T>,
        ) => Promise<{ type: "ELEMENT_TYPE" | "LIST_ELEMENT_TYPE" | "DATA_TRANSFER_TYPE" | "AGGREGATED_TYPE"; version: string; }>;
    };
    "src/api/common/TutanotaConstants": {
        FULL_INDEXED_TIMESTAMP: Timestamp;
    };
    "src/api/common/utils/Encoding": {
        timestampToGeneratedId: (timestamp: Timestamp) => Id;
        generatedIdToTimestamp: (id: Id) => Timestamp;
    };
    "src/api/common/WorkerProtocol": {
        Queue: () => void & {
            _handleMessage: (message: any) => void;
        };
    };
    "src/api/main/Entity": {
        load: <T extends BaseEntity, TypeRefType extends TypeRef<T>>(
            typeRef: TypeRef<T>,
            id: Id<T> | IdTuple<BaseEntity, T>,
        ) => Promise<T>;
        loadAll: <T extends BaseEntity, TypeRefType extends TypeRef<T>>(
            typeRef: TypeRef<T>,
            listId: Id<T>,
        ) => Promise<T[]>;
        loadRange: <T extends BaseEntity, TypeRefType extends TypeRef<T>>(
            typeRef: TypeRef<T>,
            listId: Id<T>,
            start: Id,
            count: number,
            reverse: boolean,
        ) => Promise<T[]>;
    };
}

const state: { bundle?: WebClientApi } = {};

export async function resolveWebClientApi(): Promise<WebClientApi> {
    if (state.bundle) {
        return state.bundle;
    }

    // tslint:disable-next-line:variable-name
    const SystemJS: SystemJSLoader.System = await new Promise<SystemJSLoader.System>((resolveSystemJS) => {
        const args = ["DOMContentLoaded", () => {
            resolveSystemJS((window as any).SystemJS);
            document.removeEventListener.apply(document, args);
        }];
        document.addEventListener.apply(document, args);
        // TODO reject with timeout
    });
    const baseURL = String(SystemJS.getConfig().baseURL).replace(/(.*)\/$/, "$1");
    const bundle: Record<keyof WebClientApi, any> = {
        "src/api/common/EntityFunctions": null,
        "src/api/common/TutanotaConstants": null,
        "src/api/common/utils/Encoding": null,
        "src/api/common/WorkerProtocol": null,
        "src/api/main/Entity": null,
    };

    for (const key of Object.keys(bundle) as Array<keyof WebClientApi>) {
        bundle[key] = await SystemJS.import(`${baseURL}/${key}.js`);
    }

    state.bundle = bundle as WebClientApi;

    return state.bundle;
}
