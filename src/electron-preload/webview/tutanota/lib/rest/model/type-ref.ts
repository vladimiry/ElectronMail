import {BaseEntity, Id, IdTuple, TypeRef, TypeRefApp} from "./common";
import {
    Contact,
    ContactList,
    ConversationEntry,
    EntityEventBatch,
    File,
    Mail,
    MailBody,
    MailBox,
    MailFolder,
    MailboxGroupRoot,
} from "./response";

// tslint:disable:variable-name

export const FileTypeRef = buildTypeRef<File>("File", "tutanota");
export const MailBodyTypeRef = buildTypeRef<MailBody>("MailBody", "tutanota");
export const MailboxGroupRootTypeRef = buildTypeRef<MailboxGroupRoot>("MailboxGroupRoot", "tutanota");
export const MailBoxTypeRef = buildTypeRef<MailBox>("MailBox", "tutanota");
export const MailFolderTypeRef = buildTypeRef<MailFolder>("MailFolder", "tutanota");
export const ConversationEntryTypeRef = buildTypeRef<ConversationEntry>("ConversationEntry", "tutanota");
export const MailTypeRef = buildTypeRef<Mail>("Mail", "tutanota");
export const ContactListTypeRef = buildTypeRef<ContactList>("ContactList", "tutanota");
export const ContactTypeRef = buildTypeRef<Contact>("Contact", "tutanota");
export const EntityEventBatchTypeRef = buildTypeRef<EntityEventBatch>("EntityEventBatch", "sys");

// tslint:enable:variable-name

function buildTypeRef<T extends BaseEntity<Id | IdTuple>>(
    type: Pick<TypeRef<T>, "type">["type"],
    app: TypeRefApp,
): TypeRef<T> {
    return {
        app,
        type,
    } as any;
}
