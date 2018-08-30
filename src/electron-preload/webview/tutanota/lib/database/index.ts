import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";

export {buildMail} from "./mail";
export {buildFolder} from "./folder";
export {buildContact} from "./contact";

export function buildPk<ID extends Rest.Model.IdTuple | Rest.Model.Id>(id: ID): DatabaseModel.Entity["pk"] {
    return JSON.stringify(id);
}

export function buildBaseEntity<T extends Rest.Model.BaseEntity<Rest.Model.Id | Rest.Model.IdTuple>>(input: T) {
    return {
        pk: buildPk(input._id),
        raw: JSON.stringify(input),
        id: Rest.Util.resolveInstanceId(input),
    };
}
