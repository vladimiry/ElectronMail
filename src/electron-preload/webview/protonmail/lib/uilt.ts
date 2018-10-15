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
