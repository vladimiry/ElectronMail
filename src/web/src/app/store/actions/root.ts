import {State} from "src/web/src/app/store/reducers/root";
import {ofType, unionize} from "@vladimiry/unionize";

export const ROOT_ACTIONS = unionize({
        HmrStateRestoreAction: ofType<State>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "root:",
    },
);
