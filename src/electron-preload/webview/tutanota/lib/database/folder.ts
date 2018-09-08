import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";
import {buildBaseEntity} from ".";

export function buildFolder(input: Rest.Model.MailFolder): DatabaseModel.Folder {
    return {
        ...buildBaseEntity(input),
        folderType: DatabaseModel.MAIL_FOLDER_TYPE._.parseValue(input.folderType),
        name: input.name,
        mailFolderId: input.mails,
    };
}
