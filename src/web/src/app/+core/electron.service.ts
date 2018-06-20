import {Injectable, NgZone} from "@angular/core";
import {Observable, Subscriber} from "rxjs";

import {ElectronExposure, ElectronTransport} from "_shared/model/electron";
import {ElectronIpcRendererActionType} from "_shared/electron-actions/model";
import {ipcMainStreamService} from "_shared/ipc-stream/main";
import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";
import {StackFramedError} from "_shared/model/error";

const ipcMainCaller = (() => {
    const ipcRenderer = ((window as any).__ELECTRON_EXPOSURE__ as ElectronExposure).ipcRenderer;
    const ipcRendererEventEmitter = {
        on: (event: string, listener: (...args: any[]) => void) => {
            ipcRenderer.on(event, (...args: any[]) => listener(args[1]));
            return ipcRendererEventEmitter;
        },
        off: ipcRenderer.removeListener.bind(ipcRenderer),
        emit: ipcRenderer.send.bind(ipcRenderer),
    };
    return ipcMainStreamService.caller({emitter: ipcRendererEventEmitter, listener: ipcRendererEventEmitter});
})();

@Injectable()
export class ElectronService {
    callCounter = 0;

    readonly timeoutMs = 1000 * 15;

    constructor(private zone: NgZone) {}

    callIpcMain: typeof ipcMainCaller = (name, options) => {
        return this.zone.run(() => {
            return ipcMainCaller(name, {timeoutMs: this.timeoutMs, ...options});
        });
    }

    keePassPassword(keePassClientConf: KeePassClientConf, keePassRef: KeePassRef, suppressErrors = false) {
        return this.callIpcMain("keePassRecordRequest")({keePassClientConf, keePassRef, suppressErrors});
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
}
