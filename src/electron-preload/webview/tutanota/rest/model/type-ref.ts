import {BaseResponse, TypeRef} from "./common";
import {File, Mail, MailBody, MailBox, MailboxGroupRoot, MailFolder} from "./response-entity";

// tslint:disable:variable-name

export const FileTypeRef = buildTutanotaTypeRef<File>("File");
export const MailBodyTypeRef = buildTutanotaTypeRef<MailBody>("MailBody");
export const MailboxGroupRootTypeRef = buildTutanotaTypeRef<MailboxGroupRoot>("MailboxGroupRoot_");
export const MailBoxTypeRef = buildTutanotaTypeRef<MailBox>("MailBox");
export const MailFolderTypeRef = buildTutanotaTypeRef<MailFolder>("MailFolder");
export const MailTypeRef = buildTutanotaTypeRef<Mail>("Mail");

// tslint:enable:variable-name

function buildTutanotaTypeRef<T extends BaseResponse>(type: Pick<TypeRef<T>, "type">["type"]): TypeRef<T> {
    return {
        app: "tutanota",
        type,
    } as any;
}
