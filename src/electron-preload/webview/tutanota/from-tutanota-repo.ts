import {BaseResponse, Id, TypeRef} from "_@webview-preload/tutanota/rest/model";

// tslint:disable:no-var-requires

const {
    FULL_INDEXED_TIMESTAMP: TIME_STAMP_MIN,
    NOTHING_INDEXED_TIMESTAMP: TIME_STAMP_MAX,
}: {
    FULL_INDEXED_TIMESTAMP: ReturnType<(typeof Date.prototype.getTime)>;
    NOTHING_INDEXED_TIMESTAMP: ReturnType<(typeof Date.prototype.getTime)>;
} = require("tutanota/src/api/common/TutanotaConstants");

const {
    GENERATED_MAX_ID: MAX_RESPONSE_ENTITY_ID,
    resolveTypeReference,
}: {
    GENERATED_MAX_ID: string;
    resolveTypeReference: <T extends BaseResponse>(
        typeRef: TypeRef<T>,
    ) => Promise<{ type: "ELEMENT_TYPE" | "LIST_ELEMENT_TYPE" | "DATA_TRANSFER_TYPE" | "AGGREGATED_TYPE"; version: string; }>;
} = require("tutanota/src/api/common/EntityFunctions");

// const {
//     typeRefToPath,
// }: {
//     typeRefToPath: <T extends BaseResponse>(typeRef: TypeRef<T>) => string;
// } = require("tutanota/src/api/worker/rest/EntityRestClient.js");
const typeRefToPath: <T extends BaseResponse>(typeRef: TypeRef<T>) => string = (typeRef) => {
    return `/rest/${typeRef.app}/${typeRef.type.toLowerCase()}`;
};

const {
    timestampToGeneratedId,
}: {
    timestampToGeneratedId: (timestamp: number) => Id;
} = require("tutanota/src/api/common/utils/Encoding");

export {
    TIME_STAMP_MIN,
    TIME_STAMP_MAX,
    MAX_RESPONSE_ENTITY_ID,
    resolveTypeReference,
    typeRefToPath,
    timestampToGeneratedId,
};
