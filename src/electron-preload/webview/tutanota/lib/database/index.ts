import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";

export {buildContact} from "./contact";
export {buildConversationEntry} from "./conversation-entry";
export {buildFolder} from "./folder";
export {buildMails} from "./mail";

export function buildPk<ID extends Rest.Model.IdTuple | Rest.Model.Id>(id: ID): DatabaseModel.Entity["pk"] {
    if (Array.isArray(id)) {
        return JSON.stringify(id);
    }
    if (typeof id === "string") {
        return id;
    }
    throw new Error(`Invalid "id" type`);
}

export function buildBaseEntity<T extends Rest.Model.BaseEntity<Rest.Model.Id | Rest.Model.IdTuple>>(input: T) {
    return {
        pk: buildPk(input._id),
        raw: JSON.stringify(input),
        id: Rest.Util.resolveInstanceId(input),
    };
}
