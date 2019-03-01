import {ofType, unionize} from "@vladimiry/unionize";

import {Arguments} from "src/shared/types";
import {Endpoints} from "src/shared/api/main";

export const CORE_ACTIONS = unionize({
        Stub: ofType<{}>(),
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
