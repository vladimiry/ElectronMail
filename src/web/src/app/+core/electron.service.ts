import {Observable, Subscriber} from "rxjs";
import {Injectable, NgZone} from "@angular/core";

import {ElectronIpcMainActionType, ElectronIpcRendererActionType} from "_shared/electron-actions/model";
import {ElectronTransport} from "_shared/model/electron";
import {IpcMainActions} from "_shared/electron-actions";
import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";
import {StackFramedError} from "_shared/model/error";

// @ts-ignore
const ipcRenderer = __ELECTRON_EXPOSURE__.ipcRenderer;

@Injectable()
export class ElectronService {
    callCounter = 0;
    // TODO time configuring
    // TODO debug: change to 3 sec
    readonly timeoutMs = 1000 * 15;

    constructor(private zone: NgZone) {}

    keePassPassword(keePassClientConf: KeePassClientConf, keePassRef: KeePassRef, suppressErrors = false) {
        return this.callIpcMain<IpcMainActions.KeePassRecordRequest.Type>(
            IpcMainActions.KeePassRecordRequest.channel,
            {keePassClientConf, keePassRef, suppressErrors},
        );
    }

    // @formatter:off
    callIpcMain<T extends ElectronIpcMainActionType>(
        channel: T["c"],
        payload?: T["i"],
        unSubscribeOn?: Promise<any>,
    ): Observable<T["o"]> {
        const id = this.callCounter++;
        const request = {id, payload} as ElectronTransport<T["i"]>;
        let timeoutHandle: any;
        const observable = Observable.create((observer: Subscriber<T["o"]>) => {
            const listener = (event: string, response: ElectronTransport<T["o"]>) => {
                if (response.id === request.id) {
                    if (!unSubscribeOn) {
                        clearTimeout(timeoutHandle);
                        ipcRenderer.removeListener(channel, listener);
                    }

                    this.zone.run(() => {
                        if (response.error) {
                            observer.error(new StackFramedError(response.error));
                        } else {
                            observer.next(response.payload);

                            if (!unSubscribeOn) {
                                observer.complete();
                            }
                        }
                    });
                }
            };
            if (unSubscribeOn) {
                // tslint:disable-next-line:no-floating-promises
                unSubscribeOn.then(() => {
                    const offEventName = `${channel}:off:${request.id}`;

                    ipcRenderer.send(offEventName);
                    ipcRenderer.removeListener(channel, listener);
                });
            } else {
                timeoutHandle = setTimeout(
                    () => {
                        ipcRenderer.removeListener(channel, listener);

                        this.zone.run(() => {
                            observer.error(new Error(`"ipcRenderer" <=> "ipcMain" communication timeout: ${channel}`));

                            if (!unSubscribeOn) {
                                observer.complete();
                            }
                        });
                    },
                    this.timeoutMs,
                );
            }

            ipcRenderer.on(channel, listener);
        });

        ipcRenderer.send(channel, request);

        return observable;
    }

    callIpcRenderer<T extends ElectronIpcRendererActionType>(
        channel: T["c"],
        webView: any /* TODO switch to Electron.WebviewTag */,
        payload?: T["i"],
        unSubscribeOn?: Promise<any>,
    ): Observable<T["o"]> {
        const id = this.callCounter++;
        const request = {id, payload} as ElectronTransport<T["i"]>;
        let timeoutHandle: any;
        const observable = Observable.create((observer: Subscriber<T["o"]>) => {
            const communionChannel = "ipc-message";
            const listener = ({channel: responseChannel, args}: any) => {
                const response: ElectronTransport<T["o"]> = args[0];

                if (channel === responseChannel && response.id === request.id) {
                    if (!unSubscribeOn) {
                        clearTimeout(timeoutHandle);
                        webView.removeEventListener(communionChannel, listener);
                    }

                    this.zone.run(() => {
                        if (response.error) {
                            observer.error(new StackFramedError(response.error));
                        } else {
                            observer.next(response.payload);

                            if (!unSubscribeOn) {
                                observer.complete();
                            }
                        }
                    });
                }
            };
            if (unSubscribeOn) {
                // tslint:disable-next-line:no-floating-promises
                unSubscribeOn.then(() => {
                    const offEventName = `${channel}:off:${request.id}`;

                    webView.send(offEventName);
                    webView.removeEventListener(communionChannel, listener);
                    observer.complete();
                });
            } else {
                timeoutHandle = setTimeout(
                    () => {
                        webView.removeEventListener(communionChannel, listener);

                        this.zone.run(() => {
                            observer.error(new Error(`"guest" <=> "main" pages communication timeout: ${channel}`));
                            observer.complete();
                        });
                    },
                    this.timeoutMs,
                );
            }

            webView.addEventListener(communionChannel, listener);
        });

        webView.send(channel, request);

        return observable;
    }
    // @formatter:on
}
