import * as Model from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {buildBaseEntity} from "src/electron-preload/webview/lib/database-entity/index";

const directTypeMapping: Readonly<Partial<Record<Unpacked<typeof Model.PROTONMAIL_MAILBOX_IDENTIFIERS._.values>,
    Model.Folder["folderType"]>>> = {
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Inbox]: Model.MAIL_FOLDER_TYPE.INBOX,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Sent]: Model.MAIL_FOLDER_TYPE.SENT,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Trash]: Model.MAIL_FOLDER_TYPE.TRASH,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Archive]: Model.MAIL_FOLDER_TYPE.ARCHIVE,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Spam]: Model.MAIL_FOLDER_TYPE.SPAM,
    [Model.PROTONMAIL_MAILBOX_IDENTIFIERS.Drafts]: Model.MAIL_FOLDER_TYPE.DRAFT,
};

export function buildFolder(input: RestModel.Label): Model.Folder {
    const systemFolderType = directTypeMapping[input.Type];
    const {folderType, name} = typeof systemFolderType !== "undefined"
        ? {
            folderType: systemFolderType,
            name: input.Name,
        }
        : {
            folderType: Model.MAIL_FOLDER_TYPE.CUSTOM,
            name: Model.PROTONMAIL_MAILBOX_IDENTIFIERS._.resolveNameByValue(
                input.ID as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                false,
            ) ?? input.Name,
        };
    return {
        ...buildBaseEntity(input),
        folderType,
        name,
        mailFolderId: input.ID,
        exclusive: input.Exclusive,
    };
}
