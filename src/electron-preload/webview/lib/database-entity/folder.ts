import * as Model from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {buildBaseEntity} from "src/electron-preload/webview/lib/database-entity/index";

export function buildFolder(input: RestModel.Label): Model.Folder {
    return {
        ...buildBaseEntity(input),
        type: input.Type,
        name: Model.SYSTEM_FOLDER_IDENTIFIERS._.resolveNameByValue(
            input.ID as any, // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            false,
        ) ?? input.Name,
        notify: input.Notify,
    };
}
