import {BaseEntity, Id, IdTuple, TypeRef, TypeRefApp} from "./common";
import {EntityEventBatch, File, Mail, MailBody, MailBox, MailboxGroupRoot, MailFolder} from "./response";

// tslint:disable:variable-name

export const FileTypeRef = buildTutanotaTypeRef<File>("File");
export const MailBodyTypeRef = buildTutanotaTypeRef<MailBody>("MailBody");
export const MailboxGroupRootTypeRef = buildTutanotaTypeRef<MailboxGroupRoot>("MailboxGroupRoot");
export const MailBoxTypeRef = buildTutanotaTypeRef<MailBox>("MailBox");
export const MailFolderTypeRef = buildTutanotaTypeRef<MailFolder>("MailFolder");
export const MailTypeRef = buildTutanotaTypeRef<Mail>("Mail");
export const EntityEventBatchTypeRef = buildTypeRef<EntityEventBatch>("EntityEventBatch", "sys");

// tslint:enable:variable-name

function buildTutanotaTypeRef<T extends BaseEntity<Id | IdTuple>>(
    type: Pick<TypeRef<T>, "type">["type"],
): TypeRef<T> {
    return buildTypeRef(type, "tutanota");
}

function buildTypeRef<T extends BaseEntity<Id | IdTuple>>(
    type: Pick<TypeRef<T>, "type">["type"],
    app: TypeRefApp,
): TypeRef<T> {
    return {
        app,
        type,
    } as any;
}
