import {concat, delay, exhaustMap, retryWhen, takeWhile} from "rxjs/operators";
import {Injectable, NgZone} from "@angular/core";
import {Model} from "pubsub-to-stream-api";
import {of, throwError, from} from "rxjs";

import {AccountType} from "_@shared/model/account";
import {ElectronExposure} from "_@shared/model/electron";
import {IPC_MAIN_API} from "_@shared/api/main";
import {KeePassClientConf, KeePassRef} from "_@shared/model/keepasshttp";
import {ONE_SECOND_MS} from "_@shared/constants";
import {PROTONMAIL_IPC_WEBVIEW_API, ProtonmailApi} from "_@shared/api/webview/protonmail";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi} from "_@shared/api/webview/tutanota";
import {WebViewApiService} from "electron-rpc-api/dist";

const ipcRenderer: any = ((window as any).__ELECTRON_EXPOSURE__ as ElectronExposure).ipcRenderer;
const IPC_MAIN_API_CALLER = IPC_MAIN_API.buildClient({ipcRenderer});

type WebViewApi<T extends AccountType, A = T extends "tutanota" ?  TutanotaApi : ProtonmailApi>
    = WebViewApiService<Model.ActionsRecord<Extract<keyof A, string>> & A>;

@Injectable()
export class ElectronService {
    readonly webViewPingIntervalMs = ONE_SECOND_MS / 2;
    readonly webViewPingTimeoutMs = ONE_SECOND_MS * 5;
    readonly apiCallTimeoutMs = ONE_SECOND_MS * 10;

    constructor(private zone: NgZone) {}

    buildApiCallOptions(): Model.CallOptions {
        return {timeoutMs: this.apiCallTimeoutMs, notificationWrapper: this.zone.run.bind(this.zone)};
    }

    webViewCaller<T extends AccountType>(webView: Electron.WebviewTag, type: T, callOptionsPatch: Partial<Model.CallOptions> = {}) {
        // TODO TS: get rid of "as any"
        const api: WebViewApi<T> = type === "protonmail" ? PROTONMAIL_IPC_WEBVIEW_API : TUTANOTA_IPC_WEBVIEW_API as any;
        const defaultCallOptions = {...this.buildApiCallOptions(), ...callOptionsPatch};
        const pingClient = api.buildClient(webView, {options: defaultCallOptions});
        const pingStart = Number(new Date());
        const pingObservable = from(pingClient("ping",  {timeoutMs: 1})().pipe(
            retryWhen((errors) => {
                return errors.pipe(
                    takeWhile(() => (Number(new Date()) - pingStart) < this.webViewPingTimeoutMs),
                    delay(this.webViewPingIntervalMs),
                    concat(throwError(new Error(`Failed to wait for "webview:${type}" service provider initialization`))),
                );
            }),
        ).toPromise());

        // TODO wait for api being registered once since there is no dynamic api de-registration enabled
        return pingObservable.pipe(
            exhaustMap(() => {
                return of(api.buildClient(webView, {options: defaultCallOptions}));
            }),
        );
    }

    keePassPassword(keePassClientConf: KeePassClientConf, keePassRef: KeePassRef, suppressErrors = false) {
        return this.callIpcMain("keePassRecordRequest")({keePassClientConf, keePassRef, suppressErrors});
    }

    callIpcMain: typeof IPC_MAIN_API_CALLER = (name, options) => {
        return IPC_MAIN_API_CALLER(name, Object.assign(this.buildApiCallOptions(), options));
    }
}
