import {buildEnumBundle} from "src/shared/util";

export const GROUP_TYPE = buildEnumBundle({
    User: "0",
    Admin: "1",
    Team: "2",
    Customer: "3",
    External: "4",
    Mail: "5",
    Contact: "6",
    File: "7",
    LocalAdmin: "8",
} as const);

export const MAIL_STATE = buildEnumBundle({
    DRAFT: "0",
    SENT: "1",
    RECEIVED: "2",
    SENDING: "3",
} as const);
