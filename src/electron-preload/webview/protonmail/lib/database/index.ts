import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";

export {buildContact} from "./contact";
export {buildFolder} from "./folder";
export {buildMail} from "./mail";

export function buildPk<ID extends Rest.Model.Id>(id: ID): DatabaseModel.Entity["pk"] {
    return id;
}

export function buildBaseEntity<T extends Rest.Model.Entity>(input: T) {
    return {
        pk: buildPk(input.ID),
        raw: JSON.stringify(input),
        id: input.ID,
    };
}
