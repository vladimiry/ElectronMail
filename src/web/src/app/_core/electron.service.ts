import {Injectable} from "@angular/core";
import {Model} from "pubsub-to-stream-api";
import {concat, concatMap, delay, retryWhen, takeWhile} from "rxjs/operators";
import {from, of, throwError} from "rxjs";

import {AccountType} from "src/shared/model/account";
import {IPC_MAIN_API} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {TUTANOTA_IPC_WEBVIEW_API} from "src/shared/api/webview/tutanota";
import {WebViewApi} from "src/shared/api/webview/common";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

type CallOptions = Partial<Pick<Model.CallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getZoneNameBoundWebLogger("[accounts.effects]");

@Injectable()
export class ElectronService {
    readonly webViewPingIntervalMs = ONE_SECOND_MS / 2;
    readonly webViewPingTimeoutMs = ONE_SECOND_MS * 20;
    readonly apiCallTimeoutMs = ONE_SECOND_MS * 15;

    constructor() {}

    webViewClient<T extends AccountType>(webView: Electron.WebviewTag, type: T, options?: CallOptions) {
        // TODO TS: get rid of "as any"
        const api: WebViewApi<T> = type === "protonmail" ? PROTONMAIL_IPC_WEBVIEW_API : TUTANOTA_IPC_WEBVIEW_API as any;
        const apiClient = api.buildClient(webView, {options: this.buildApiCallOptions(options)});

        // TODO consider removing "ping" API
        // TODO it's sufficient to "ping" API initialization only once since there is no dynamic api de-registration enabled
        const pingStart = Number(new Date());
        const ping$ = from(apiClient("ping", {timeoutMs: 1})({zoneName: logger.zoneName()}).pipe(
            retryWhen((errors) => errors.pipe(
                takeWhile(() => (Number(new Date()) - pingStart) < this.webViewPingTimeoutMs),
                delay(this.webViewPingIntervalMs),
                concat(throwError(new Error(`Failed to wait for "webview:${type}" service provider initialization`))),
            )),
        ).toPromise());

        return ping$.pipe(
            concatMap(() => of(apiClient)),
        );
    }

    ipcMainClient(options?: CallOptions) {
        return IPC_MAIN_API.buildClient({
            ipcRenderer: __ELECTRON_EXPOSURE__.ipcRendererTransport,
            options: this.buildApiCallOptions(options),
        });
    }

    private buildApiCallOptions(options: CallOptions = {}): Model.CallOptions {
        return Object.assign(
            {timeoutMs: this.apiCallTimeoutMs, notificationWrapper: Zone.current.run.bind(Zone.current)},
            options,
        );
    }
}
