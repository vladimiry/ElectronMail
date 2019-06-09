import {ofType, unionize} from "@vladimiry/unionize";

import {IpcMainApiEndpoints} from "src/shared/api/main";

export type NotificationItem =
    | Readonly<{ type: "error"; data: Readonly<Error>; }>
    | Readonly<{ type: "info"; data: Readonly<{ message: string }>; }>;

export const NOTIFICATION_ACTIONS = unionize({
        Error: ofType<Extract<NotificationItem, { type: "error" }>["data"]>(),
        Info: ofType<Extract<NotificationItem, { type: "info" }>["data"]>(),
        Remove: ofType<NotificationItem>(),
        UpdateOverlayIcon: ofType<Arguments<IpcMainApiEndpoints["updateOverlayIcon"]>[0]>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "notification:",
    },
);
