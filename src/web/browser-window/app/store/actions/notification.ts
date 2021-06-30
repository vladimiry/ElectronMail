import {ofType, unionize} from "@vladimiry/unionize";

import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";

export type NotificationItem =
    | Readonly<{ type: "error"; data: Readonly<Error & {code?: unknown}> }>
    | Readonly<{ type: "message"; data: Readonly<{ message: string; style: "error" | "warning" | "info"; html?: boolean }> }>
    | Readonly<{ type: "update"; data: Readonly<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> }>;

export const NOTIFICATION_ACTIONS = unionize({
        Error: ofType<Extract<NotificationItem, { type: "error" }>["data"]>(),
        ErrorSkipLogging: ofType<Extract<NotificationItem, { type: "error" }>["data"]>(),
        Message: ofType<Extract<NotificationItem, { type: "message" }>["data"]>(),
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
