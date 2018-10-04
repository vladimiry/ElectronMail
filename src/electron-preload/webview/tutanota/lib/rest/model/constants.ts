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
});
