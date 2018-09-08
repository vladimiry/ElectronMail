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

// TODO consider using https://github.com/cedx/enum.js instead
function build<V extends string, M extends { [k: string]: V }>(nameValueMap: M) {
    const {names, values, valueNameMap} = Object
        .entries(nameValueMap)
        .reduce((accumulator: { names: Array<keyof M>; values: V[]; valueNameMap: { [k in V]: string } }, [key, value]) => {
            accumulator.names.push(key);
            accumulator.values.push(value as V);
            accumulator.valueNameMap[value] = key;
            return accumulator;
        }, {values: [], names: [], valueNameMap: {} as any});
    const resolveNameByValue = (value: V, strict: boolean = true): keyof M => {
        if (strict && !(value in valueNameMap)) {
            throw new Error(`Failed to parse "${value}" value from the "${JSON.stringify(nameValueMap)}" map`);
        }
        return valueNameMap[value];
    };
    const parseValue = (rawValue: any, strict: boolean = true): V => nameValueMap[resolveNameByValue(rawValue, strict)];

    // TODO deep freeze the result object
    return Object.assign(
        {
            _: {resolveNameByValue, parseValue, names, values, nameValueMap},
        },
        nameValueMap,
    );
}
