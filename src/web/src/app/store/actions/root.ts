import {ofType, unionize} from "unionize";

import {State} from "_@web/src/app/store/reducers/root";

export const ROOT_ACTIONS = unionize({
        HmrStateRestoreAction: ofType<State>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "root:",
    },
);
