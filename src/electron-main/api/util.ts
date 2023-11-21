import {getQuickJS} from "quickjs-emscripten";
import type {QuickJSWASMModule} from "quickjs-emscripten";

import {Folder, LABEL_TYPE, Mail, View} from "src/shared/model/database";
import {htmlToText} from "src/shared/util/html-to-text";
import {parseProtonRestModel, readMailBody} from "src/shared/util/entity";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

// TODO quickJS: consider separating it to "Worker threads"
export const resolveCachedQuickJSInstance: () => Promise<QuickJSWASMModule> = (() => {
    let getQuickJSPromise: ReturnType<typeof getQuickJS> | undefined;
    return async () => getQuickJSPromise ??= getQuickJS();
})();

const folderPropsToRawProps = (
    folders: DeepReadonly<Array<View.Folder>>,
    type: Unpacked<typeof LABEL_TYPE._.values>,
): Array<{ Id: string, Name: string, Unread: number, Size: number }> => {
    return folders
        .filter((folder) => folder.type === type)
        .map(({id, name, unread, size}) => ({Id: id, Name: name, Unread: unread, Size: size}));
};

export const augmentRawMailWithBodyFields = (
    mail: DeepReadonly<Mail>,
    includeBodyTextField: boolean,
): RestModel.Message & { EncryptedBody: string, Body: string, BodyText?: string } => {
    const parsedRawMail = parseProtonRestModel(mail);
    const body = readMailBody(mail);

    return {
        ...parsedRawMail,
        Body: body,
        EncryptedBody: parsedRawMail.Body,
        ...(includeBodyTextField && {BodyText: htmlToText(body)}),
    };
};

export const augmentRawMailWithFolders = (
    mail: DeepReadonly<Mail>,
    foldersArg: View.Folder[] | (({id}: Pick<Folder, "id">) => View.Folder | undefined),
    includeBodyTextField: boolean,
): ReturnType<typeof augmentRawMailWithBodyFields> & {
    _BodyDecryptionFailed?: boolean
    Folders: Array<{ Id: string, Name: string, Unread: number, Size: number }>
    Labels: Array<{ Id: string, Name: string, Unread: number, Size: number }>
} => {
    const mailFolders: View.Folder[] = typeof foldersArg === "function"
        ? []
        : foldersArg;

    if (typeof foldersArg === "function") {
        for (const id of mail.mailFolderIds) {
            const folder = foldersArg({id});
            if (folder) {
                mailFolders.push(folder);
            }
        }
    }

    return {
        ...augmentRawMailWithBodyFields(mail, includeBodyTextField),
        ...(mail.failedDownload && {_BodyDecryptionFailed: true}),
        Folders: folderPropsToRawProps(mailFolders, LABEL_TYPE.MESSAGE_FOLDER),
        Labels: folderPropsToRawProps(mailFolders, LABEL_TYPE.MESSAGE_LABEL),
    };
};
