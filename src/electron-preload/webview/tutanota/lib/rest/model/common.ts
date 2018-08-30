export type Id<T extends string = string> = T;

export type IdTuple<ID1 extends Id = Id, ID2 extends Id = Id> = [ID1, ID2];

export interface BaseEntity<ID extends Id | IdTuple> {
    _id: ID;
}

export type TypeRefApp = "tutanota" | "sys";

export type TypeRefType = "File" | "MailBody" | "MailboxGroupRoot" | "MailBox" | "MailFolder" | "Mail" | "Contact" | "EntityEventBatch";

export interface TypeRef<T extends BaseEntity<Id | IdTuple>> {
    _type: T;
    app: TypeRefApp;
    type: TypeRefType;
}

export interface RequestParams {
    ids?: Id[];
    start?: string;
    count?: number;
    reverse?: boolean;
}
