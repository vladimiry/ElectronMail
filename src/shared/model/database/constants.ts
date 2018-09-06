export const GROUP_TYPE = build({
    User: "0",
    Admin: "1",
    Team: "2",
    Customer: "3",
    External: "4",
    Mail: "5",
    Contact: "6",
    File: "7",
    LocalAdmin: "8",
});

export const OPERATION_TYPE = build({
    CREATE: "0",
    UPDATE: "1",
    DELETE: "2",
});

export const MAIL_FOLDER_TYPE = build({
    CUSTOM: "0",
    INBOX: "1",
    SENT: "2",
    TRASH: "3",
    ARCHIVE: "4",
    SPAM: "5",
    DRAFT: "6",
});

export const MAIL_STATE = build({
    DRAFT: "0",
    SENT: "1",
    RECEIVED: "2",
});

export const CONTACT_ADDRESS_TYPE = build({
    PRIVATE: "0",
    WORK: "1",
    OTHER: "2",
    CUSTOM: "3",
});

export const CONTACT_PHONE_NUMBER_TYPE = build({
    PRIVATE: "0",
    WORK: "1",
    MOBILE: "2",
    FAX: "3",
    OTHER: "4",
    CUSTOM: "5",
});

export const CONTACT_SOCIAL_TYPE = build({
    TWITTER: "0",
    FACEBOOK: "1",
    XING: "2",
    LINKED_IN: "3",
    OTHER: "4",
    CUSTOM: "5",
});

// TODO cache entries as Map<value,type> instead of iteration over array, O(1) instead of O(n) complexity
function build<V extends string, M extends { [k: string]: V }>(map: M) {
    const {names, values} = Object.entries(map).reduce((accumulator, [key, value]) => {
        accumulator.names.push(key);
        accumulator.values.push(value as V);
        return accumulator;
    }, ((value: { names: Array<keyof M>, values: V[] }) => value)({values: [], names: []}));
    const index = (rawValue: V/*, strict: boolean = true*/) => {
        const result = values.indexOf(String(rawValue) as V);
        if (/*strict && */result === -1) {
            throw new Error(`Invalid value`);
        }
        return result;
    };
    const parse = (rawValue: any) => values[index(rawValue)];
    const name = (rawValue: V) => names[index(rawValue)];

    // TODO deep freeze the result object
    return Object.assign(
        {_: {index, parse, name, names, values, map}},
        map,
    );
}
