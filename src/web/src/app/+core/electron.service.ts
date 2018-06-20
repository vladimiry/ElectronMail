import {Injectable, NgZone} from "@angular/core";
import {Model} from "pubsub-to-stream-api";

import {ElectronExposure} from "_shared/model/electron";
import {ipcMainStreamService} from "_shared/ipc-stream/main";
import {ipcWebViewStreamService} from "_shared/ipc-stream/webview";
import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";

const ipcMainCaller = (() => {
    const ipcRenderer = ((window as any).__ELECTRON_EXPOSURE__ as ElectronExposure).ipcRenderer;
    const eventEmitter: Model.EventListener & Model.EventEmitter = {
        on: (event, listener) => {
            ipcRenderer.on(event, (...args: any[]) => listener(args[1]));
            return eventEmitter;
        },
        off: ipcRenderer.removeListener.bind(ipcRenderer),
        emit: ipcRenderer.send.bind(ipcRenderer),
    };
    return ipcMainStreamService.caller({emitter: eventEmitter, listener: eventEmitter});
})();

const ipcWebViewCallerBuilder = (webView: Electron.WebviewTag, options: Model.CallOptions) => {
    const listenEvent = "ipc-message";
    const eventEmitter: Model.EventListener & Model.EventEmitter = {
        on: (event, listener) => {
            webView.addEventListener(listenEvent, ({channel, args}) => {
                if (channel !== event) {
                    return;
                }
                listener(args[0]);
            });
            return eventEmitter;
        },
        off: (event, listener) => {
            webView.removeEventListener(listenEvent, listener);
            return eventEmitter;
        },
        emit: webView.send.bind(webView),
    };
    return ipcWebViewStreamService.caller({emitter: eventEmitter, listener: eventEmitter}, options);
};

@Injectable()
export class ElectronService {
    callCounter = 0;

    readonly timeoutMs = 1000 * 15;

    constructor(private zone: NgZone) {}

    callIpcMain: typeof ipcMainCaller = (name, options) => {
        return ipcMainCaller(name, {timeoutMs: this.timeoutMs, notificationWrapper: this.zone.run.bind(this.zone), ...options});
    }

    keePassPassword(keePassClientConf: KeePassClientConf, keePassRef: KeePassRef, suppressErrors = false) {
        return this.callIpcMain("keePassRecordRequest")({keePassClientConf, keePassRef, suppressErrors});
    }

    ipcRendererCaller(webView: Electron.WebviewTag) {
        return ipcWebViewCallerBuilder(webView, {timeoutMs: this.timeoutMs, notificationWrapper: this.zone.run.bind(this.zone)});
    }
}
