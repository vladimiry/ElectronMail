import {ofType, unionize} from "@vladimiry/unionize";

import {Arguments} from "src/shared/types";
import {Endpoints} from "src/shared/api/main";

export const CORE_ACTIONS = unionize({
        Fail: ofType<Error>(),
        RemoveError: ofType<Error>(),
        UpdateOverlayIcon: ofType<Arguments<Endpoints["updateOverlayIcon"]>[0]>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "core:",
    },
);
