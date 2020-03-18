import {ofType, unionize} from "@vladimiry/unionize";

import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";

export type NotificationItem =
    | Readonly<{ type: "error"; data: Readonly<Error> }>
    | Readonly<{ type: "errorMessage"; data: Readonly<{ message: string }> }>
    | Readonly<{ type: "info"; data: Readonly<{ message: string }> }>
    | Readonly<{ type: "update"; data: Readonly<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> }>;

export const NOTIFICATION_ACTIONS = unionize({
        Error: ofType<Extract<NotificationItem, { type: "error" }>["data"]>(),
        ErrorMessage: ofType<Extract<NotificationItem, { type: "errorMessage" }>["data"]>(),
        Info: ofType<Extract<NotificationItem, { type: "info" }>["data"]>(),
        Update: ofType<Extract<NotificationItem, { type: "update" }>["data"]>(),
        Remove: ofType<NotificationItem>(),
        UpdateOverlayIcon: ofType<Parameters<IpcMainApiEndpoints["updateOverlayIcon"]>[0]>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "notification:",
    },
);
