import {Injectable, OnDestroy} from "@angular/core";
import {Model} from "pubsub-to-stream-api";
import {Store, select} from "@ngrx/store";
import {Subscription} from "rxjs/Subscription";
import {concat, concatMap, delay, mergeMap, retryWhen, switchMap, take, takeWhile} from "rxjs/operators";
import {from, of, throwError} from "rxjs";

import {AccountType} from "src/shared/model/account";
import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/constants";
import {IPC_MAIN_API} from "src/shared/api/main";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {State} from "src/web/src/app/store/reducers/options";
import {TUTANOTA_IPC_WEBVIEW_API} from "src/shared/api/webview/tutanota";
import {WebViewApi} from "src/shared/api/webview/common";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

type CallOptions = Partial<Pick<Model.CallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getZoneNameBoundWebLogger("[_core/electron.service]");

@Injectable()
export class ElectronService implements OnDestroy {
    private defaultApiCallTimeoutMs = DEFAULT_API_CALL_TIMEOUT;
    private readonly webViewApiPingIntervalMs = ONE_SECOND_MS / 2;
    private readonly timeouts$ = this.store.pipe(select(OptionsSelectors.CONFIG.timeouts));
    private readonly subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {
        this.subscription.add(
            this.store
                .pipe(
                    select(OptionsSelectors.FEATURED.config),
                    mergeMap((config) => {
                        const defined = (
                            config &&
                            typeof config.timeouts === "object" &&
                            typeof config.timeouts.defaultApiCall === "number"
                        );
                        return defined
                            ? [config.timeouts.defaultApiCall]
                            : [];
                    }),
                )
                .subscribe((value) => {
                    if (this.defaultApiCallTimeoutMs === value) {
                        return;
                    }
                    logger.info(`changing "defaultApiCallTimeoutMs" from ${this.defaultApiCallTimeoutMs} to ${value}`);
                    this.defaultApiCallTimeoutMs = value;
                }),
        );
    }

    webViewClient<T extends AccountType>(webView: Electron.WebviewTag, type: T, options?: CallOptions) {
        // TODO TS: get rid of "as any"
        const api: WebViewApi<T> = type === "protonmail" ? PROTONMAIL_IPC_WEBVIEW_API : TUTANOTA_IPC_WEBVIEW_API as any;
        const apiClient = api.buildClient(webView, {options: this.buildApiCallOptions(options)});

        // TODO consider removing "ping" API
        // TODO it's sufficient to "ping" API initialization only once since there is no dynamic api de-registration enabled
        const pingStart = Number(new Date());
        const ping$ = this.timeouts$.pipe(
            take(1),
            // tslint:disable-next-line:ban
            switchMap((timeouts) => {
                return from(apiClient("ping", {timeoutMs: 1})({zoneName: logger.zoneName()}).pipe(
                    retryWhen((errors) => errors.pipe(
                        takeWhile(() => (Number(new Date()) - pingStart) < timeouts.webViewApiPing),
                        delay(this.webViewApiPingIntervalMs),
                        concat(throwError(new Error(`Failed to wait for "webview:${type}" service provider initialization`))),
                    )),
                ).toPromise());
            }),
        );

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

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private buildApiCallOptions(options: CallOptions = {}): Model.CallOptions {
        return Object.assign(
            {timeoutMs: this.defaultApiCallTimeoutMs, notificationWrapper: Zone.current.run.bind(Zone.current)},
            options,
        );
    }
}
