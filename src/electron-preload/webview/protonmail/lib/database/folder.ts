import * as Model from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";
import {buildBaseEntity} from ".";

const directTypeMapping: Record<keyof typeof Model.PROTONMAIL_MAILBOX_IDENTIFIERS._.nameValueMap, Model.Folder["folderType"]> = {
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Inbox]: Model.MAIL_FOLDER_TYPE.INBOX,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Sent]: Model.MAIL_FOLDER_TYPE.SENT,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Trash]: Model.MAIL_FOLDER_TYPE.TRASH,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Archive]: Model.MAIL_FOLDER_TYPE.ARCHIVE,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Spam]: Model.MAIL_FOLDER_TYPE.SPAM,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Drafts]: Model.MAIL_FOLDER_TYPE.DRAFT,
};

export function buildFolder(input: Rest.Model.Label): Model.Folder {
    const {folderType, name} = input.Type in directTypeMapping
        ? {
            folderType: directTypeMapping[input.Type],
            name: input.Name,
        }
        : {
            folderType: Model.MAIL_FOLDER_TYPE.CUSTOM,
            name: Model.PROTONMAIL_MAILBOX_IDENTIFIERS._.resolveNameByValue(input.ID as any, false) || input.Name,
        };
    return {
        ...buildBaseEntity(input),
        folderType,
        name,
        mailFolderId: input.ID,
    };
}
