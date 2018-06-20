export enum IpcRendererChannel {
    AccountNotification = "account:notification",
    AccountFillLogin = "account:fill-login",
    AccountLogin = "account:login",
    AccountLogin2FA = "account:login2fa",
    AccountUnlock = "account:unlock",
}

export interface ElectronActionType<T extends IpcRendererChannel> {
    i: any; // TODO use "grouping" "ElectronActionType.i" interface
    o: any; // TODO use "grouping" "ElectronActionType.o" interface
    c: T;
}

export interface ElectronIpcRendererActionType extends ElectronActionType<IpcRendererChannel> {}

export class ElectronIpcRendererAction<T extends ElectronIpcRendererActionType> {
    constructor(public channel: T["c"], public process: (args: T["i"]) => Promise<T["o"]>) {}
}
