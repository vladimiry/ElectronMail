import {ElectronIpcRendererActionType, IpcRendererChannel} from "_shared/electron-actions/model";

export const channel = IpcRendererChannel.AccountNotification;

export interface Noop {
    type: "noop";
    message?: string;
}

export interface NotAuthorizedNotification {
    type: "unauthorized";
}

export interface TitleNotification {
    type: "title";
    value: string;
}

export interface UnreadNotification {
    type: "unread";
    value: number;
}

export type O =
    | Noop
    | NotAuthorizedNotification
    | TitleNotification
    | UnreadNotification
    | { type: "offline" };

export interface Type extends ElectronIpcRendererActionType {
    i: void; // {interval:number};
    o: O;
    c: typeof channel;
}
