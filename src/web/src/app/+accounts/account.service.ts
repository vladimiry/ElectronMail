import {Injectable} from "@angular/core";

import {IpcRendererActions} from "_shared/electron-actions";
import {ElectronService} from "../+core/electron.service";

@Injectable()
export class AccountService {
    // TODO timeout configuring
    readonly timeoutMs = 1000 * 5;

    constructor(private electronService: ElectronService) {}

    notification(webView: any /* TODO switch to Electron.WebviewTag */,
                 payload: IpcRendererActions.Notification.Type["i"],
                 unSubscribeOn: Promise<any>) {
        return this.electronService.callIpcRenderer<IpcRendererActions.Notification.Type>(
            IpcRendererActions.Notification.channel, webView, payload, unSubscribeOn,
        );
    }

    fillLogin(webView: any /* TODO switch to Electron.WebviewTag */,
              payload: IpcRendererActions.FillLogin.Type["i"]) {
        return this.electronService.callIpcRenderer<IpcRendererActions.FillLogin.Type>(
            IpcRendererActions.FillLogin.channel, webView, payload,
        );
    }

    login(webView: any /* TODO switch to Electron.WebviewTag */,
          payload: IpcRendererActions.Login.Type["i"]) {
        return this.electronService.callIpcRenderer<IpcRendererActions.Login.Type>(
            IpcRendererActions.Login.channel, webView, payload,
        );
    }

    login2fa(webView: any /* TODO switch to Electron.WebviewTag */,
             payload: IpcRendererActions.Login2FA.Type["i"]) {
        return this.electronService.callIpcRenderer<IpcRendererActions.Login2FA.Type>(
            IpcRendererActions.Login2FA.channel, webView, payload,
        );
    }

    unlock(webView: any /* TODO switch to Electron.WebviewTag */,
           payload: IpcRendererActions.Unlock.Type["i"]) {
        return this.electronService.callIpcRenderer<IpcRendererActions.Unlock.Type>(
            IpcRendererActions.Unlock.channel, webView, payload,
        );
    }
}
