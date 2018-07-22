// tslint:disable-next-line:variable-name
export const GroupType: Record<string, "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"> = {
    User: "0",
    Admin: "1",
    Team: "2",
    Customer: "3",
    External: "4",
    Mail: "5",
    Contact: "6",
    File: "7",
    LocalAdmin: "8",
};

// tslint:disable-next-line:variable-name
export const OperationType: Record<string, "0" | "1" | "2"> = {
    CREATE: "0",
    UPDATE: "1",
    DELETE: "2",
};

export type NumberString = string;

export type TypeRefApp = "tutanota" | "sys";

export type Id<T extends string = string> = T;

export type IdTuple<ID1 extends Id = Id, ID2 extends Id = Id> = [ID1, ID2];

export interface BaseEntity<ID extends Id | IdTuple> {
    _id: ID;
}

export interface TypeRef<T extends BaseEntity<Id | IdTuple>> {
    _type: T;
    app: TypeRefApp;
    type: string;
}

export interface RequestParams {
    ids?: Id[];
    start?: string;
    count?: number;
    reverse?: boolean;
}
