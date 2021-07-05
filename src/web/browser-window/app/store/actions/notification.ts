import {props} from "@ngrx/store";

import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {propsRecordToActionsRecord} from "src/shared/ngrx-util";

export type NotificationItem =
    | Readonly<{ type: "error"; data: Readonly<Error & { code?: unknown }> }>
    | Readonly<{ type: "message"; data: Readonly<{ message: string; style: "error" | "warning" | "info"; html?: boolean }> }>
    | Readonly<{ type: "update"; data: Readonly<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> }>;

export const NOTIFICATION_ACTIONS = propsRecordToActionsRecord(
    {
        Error: props<Extract<NotificationItem, { type: "error" }>["data"]>(),
        ErrorSkipLogging: props<Extract<NotificationItem, { type: "error" }>["data"]>(),
        Message: props<Extract<NotificationItem, { type: "message" }>["data"]>(),
        Update: props<Extract<NotificationItem, { type: "update" }>["data"]>(),
        Remove: props<NotificationItem>(),
        UpdateOverlayIcon: props<Parameters<IpcMainApiEndpoints["updateOverlayIcon"]>[0]>(),
    },
    {prefix: __filename},
);
