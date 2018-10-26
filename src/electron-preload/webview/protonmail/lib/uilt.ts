import * as Rest from "./rest";
import {Unpacked} from "src/shared/types";

export const isUpsertOperationType = (<V = Unpacked<typeof Rest.Model.EVENT_ACTION._.values>>(
    types: Set<V>,
) => (type: V): boolean => {
    return types.has(type);
})(new Set([
    Rest.Model.EVENT_ACTION.CREATE,
    Rest.Model.EVENT_ACTION.UPDATE,
    Rest.Model.EVENT_ACTION.UPDATE_DRAFT,
    Rest.Model.EVENT_ACTION.UPDATE_FLAGS,
]));

export const isAngularJsHttpResponse: (data: ng.IHttpResponse<any> | any) => data is ng.IHttpResponse<any> = ((
    signatureKeys: Array<keyof ng.IHttpResponse<any>> = ["data", "status", "headers", "config", "statusText", "xhrStatus"],
) => {
    return ((data: ng.IHttpResponse<any> | any) => {
        if (typeof data !== "object") {
            return false;
        }
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
        return signatureKeys.reduce((count, prop) => count + Number(prop in data), 0) === signatureKeys.length;
    }) as typeof isAngularJsHttpResponse;
})();
