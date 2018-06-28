import {ofType, unionize} from "unionize";

export const CORE_ACTIONS = unionize({
        Fail: ofType<Error>(),
        RemoveError: ofType<Error>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "core:",
    },
);
