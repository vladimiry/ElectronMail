import {Injectable, NgZone} from "@angular/core";

import {ElectronExposure} from "_shared/model/electron";
import {IPC_MAIN_API} from "_shared/api/main";
import {IPC_WEBVIEW_API} from "_shared/api/webview";
import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";

const ipcRenderer: any = ((window as any).__ELECTRON_EXPOSURE__ as ElectronExposure).ipcRenderer;
const IPC_MAIN_API_CALLER = IPC_MAIN_API.buildClient({ipcRenderer});

@Injectable()
export class ElectronService {
    callCounter = 0;

    readonly timeoutMs = 1000 * 15;

    constructor(private zone: NgZone) {}

    webViewCaller(webView: Electron.WebviewTag) {
        return IPC_WEBVIEW_API
            .buildClient(webView, {options: {timeoutMs: this.timeoutMs, notificationWrapper: this.zone.run.bind(this.zone)}});
    }

    keePassPassword(keePassClientConf: KeePassClientConf, keePassRef: KeePassRef, suppressErrors = false) {
        return this.callIpcMain("keePassRecordRequest")({keePassClientConf, keePassRef, suppressErrors});
    }

    callIpcMain: typeof IPC_MAIN_API_CALLER = (name, options) => {
        return IPC_MAIN_API_CALLER(name, {timeoutMs: this.timeoutMs, notificationWrapper: this.zone.run.bind(this.zone), ...options});
    }
}
