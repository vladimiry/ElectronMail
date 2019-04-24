import {Injectable, OnDestroy} from "@angular/core";
import {Model} from "pubsub-to-stream-api";
import {Observable, Subscription, from, of, throwError, timer} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concat, concatMap, delay, filter, map, mergeMap, retryWhen, switchMap, take, takeWhile, withLatestFrom} from "rxjs/operators";

import {AccountType} from "src/shared/model/account";
import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";
import {WebViewApi} from "src/shared/api/webview/common";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

type CallOptions = Partial<Pick<Model.CallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getZoneNameBoundWebLogger("[_core/electron.service]");

@Injectable()
export class ElectronService implements OnDestroy {
    private defaultApiCallTimeoutMs = DEFAULT_API_CALL_TIMEOUT;
    private readonly webViewApiPingIntervalMs = ONE_SECOND_MS / 2;
    private readonly subscription = new Subscription();
    private readonly onlinePingWithTimeouts$ = timer(0, ONE_SECOND_MS).pipe(
        filter(() => navigator.onLine),
        take(1),
        withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.timeouts))),
        map(([, timeouts]) => timeouts),
    );

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

    webViewClient<T extends AccountType>(
        webView: Electron.WebviewTag,
        type: T,
        options?: CallOptions,
    ): Observable<ReturnType<WebViewApi<T>["buildClient"]>> {
        // TODO TS: figure why "webViewClient()" client stopped to be type safe after some TS version update
        const client: ReturnType<WebViewApi<T>["buildClient"]> = __ELECTRON_EXPOSURE__.buildIpcWebViewClient[type](
            webView,
            {
                options: this.buildApiCallOptions(options),
            },
        );

        // TODO consider removing "ping" API
        // TODO it's sufficient to "ping" API initialization only once since there is no dynamic webview api de-registration happening
        const ping$ = this.onlinePingWithTimeouts$.pipe(
            // tslint:disable-next-line:ban
            switchMap(({webViewApiPing}) => {
                const pingStart = Date.now();

                return from(client("ping", {timeoutMs: 1})({zoneName: logger.zoneName()}).pipe(
                    retryWhen((errors) => errors.pipe(
                        takeWhile(() => (Date.now() - pingStart) < webViewApiPing),
                        delay(this.webViewApiPingIntervalMs),
                        concat(throwError(new Error(`Failed to wait for "webview:${type}" service provider initialization`))),
                    )),
                ).toPromise());
            }),
        );

        return ping$.pipe(
            concatMap(() => of(client)),
        );
    }

    ipcMainClient(options?: CallOptions) {
        return __ELECTRON_EXPOSURE__.buildIpcMainClient({
            options: this.buildApiCallOptions(options),
        });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private buildApiCallOptions(options: CallOptions = {}): Model.CallOptions {
        return {
            timeoutMs: this.defaultApiCallTimeoutMs,
            notificationWrapper: Zone.current.run.bind(Zone.current),
            ...options,
        };
    }
}
