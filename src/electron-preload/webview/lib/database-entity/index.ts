import * as DatabaseModel from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

export {buildContact} from "src/electron-preload/webview/lib/database-entity/contact";
export {buildFolder} from "src/electron-preload/webview/lib/database-entity/folder";
export {buildMail} from "src/electron-preload/webview/lib/database-entity/mail";

export function buildPk<ID extends RestModel.Id>(id: ID): DatabaseModel.Entity["pk"] {
    return id;
}

export function buildBaseEntity<T extends RestModel.Entity>(
    input: T
): NoExtraProperties<DatabaseModel.Entity> {
    return {
        pk: buildPk(input.ID),
        raw: JSON.stringify(input),
        id: input.ID,
    };
}
