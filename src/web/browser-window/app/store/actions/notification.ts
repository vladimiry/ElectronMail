import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {props, propsRecordToActionsRecord} from "src/shared/util/ngrx";

export type NotificationItem =
    | Readonly<{ type_: "error"; data: Readonly<Error & { code?: unknown }> }>
    | Readonly<{ type_: "message"; data: Readonly<{ message: string; style: "error" | "warning" | "info"; html?: boolean }> }>
    | Readonly<{ type_: "update"; data: Readonly<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> }>;

export const NOTIFICATION_ACTIONS = propsRecordToActionsRecord(
    {
        Error: props<Extract<NotificationItem, { type_: "error" }>["data"]>(),
        ErrorSkipLogging: props<Extract<NotificationItem, { type_: "error" }>["data"]>(),
        Message: props<Extract<NotificationItem, { type_: "message" }>["data"]>(),
        Update: props<Extract<NotificationItem, { type_: "update" }>["data"]>(),
        Remove: props<NotificationItem>(),
        UpdateOverlayIcon: props<Parameters<IpcMainApiEndpoints["updateOverlayIcon"]>[0]>(),
    },
    {prefix: __filename},
);
