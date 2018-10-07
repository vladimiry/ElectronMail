import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";
import {buildBaseEntity} from ".";

const directTypeMapping: Record<keyof typeof Rest.Model.MAILBOX_IDENTIFIERS._.nameValueMap, DatabaseModel.Folder["folderType"]> = {
    [Rest.Model.MAILBOX_IDENTIFIERS.Inbox]: DatabaseModel.MAIL_FOLDER_TYPE.INBOX,
    [Rest.Model.MAILBOX_IDENTIFIERS.Sent]: DatabaseModel.MAIL_FOLDER_TYPE.SENT,
    [Rest.Model.MAILBOX_IDENTIFIERS.Trash]: DatabaseModel.MAIL_FOLDER_TYPE.TRASH,
    [Rest.Model.MAILBOX_IDENTIFIERS.Archive]: DatabaseModel.MAIL_FOLDER_TYPE.ARCHIVE,
    [Rest.Model.MAILBOX_IDENTIFIERS.Spam]: DatabaseModel.MAIL_FOLDER_TYPE.SPAM,
    [Rest.Model.MAILBOX_IDENTIFIERS.Drafts]: DatabaseModel.MAIL_FOLDER_TYPE.DRAFT,
};

export function buildFolder(input: Rest.Model.Label): DatabaseModel.Folder {
    const {folderType, name} = input.Type in directTypeMapping
        ? {
            folderType: directTypeMapping[input.Type],
            name: input.Name,
        }
        : {
            folderType: DatabaseModel.MAIL_FOLDER_TYPE.CUSTOM,
            name: Rest.Model.MAILBOX_IDENTIFIERS._.resolveNameByValue(input.ID as any, false) || input.Name,
        };
    return {
        ...buildBaseEntity(input),
        folderType,
        name,
        mailFolderId: input.ID,
    };
}
