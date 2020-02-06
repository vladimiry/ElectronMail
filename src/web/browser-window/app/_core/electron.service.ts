import {Injectable, NgZone, OnDestroy} from "@angular/core";
import {Observable, Subscription, defer, of, race, throwError, timer} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, delay, filter, map, mergeMap, retryWhen, switchMap, take, withLatestFrom} from "rxjs/operators";
import {createIpcMainApiService} from "electron-rpc-api";

import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/primary";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

type SuperCallOptions = Required<Exclude<Parameters<ReturnType<(typeof createIpcMainApiService)>["client"]>[0], undefined>>["options"];

type LimitedCallOptions = Partial<Pick<SuperCallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getZoneNameBoundWebLogger("[_core/electron.service]");

@Injectable()
export class ElectronService implements OnDestroy {
    private defaultApiCallTimeoutMs = DEFAULT_API_CALL_TIMEOUT;
    private readonly subscription = new Subscription();
    private readonly onlinePingWithTimeouts$ = timer(0, ONE_SECOND_MS).pipe(
        filter(() => navigator.onLine),
        take(1),
        withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.timeouts))),
        map(([, timeouts]) => timeouts),
    );

    constructor(
        private store: Store<State>,
        private ngZone: NgZone,
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

    webViewClient(
        webView: Electron.WebviewTag,
        options?: LimitedCallOptions,
    ): Observable<ReturnType<typeof PROTONMAIL_IPC_WEBVIEW_API.client>> {
        const client = PROTONMAIL_IPC_WEBVIEW_API.client(
            webView,
            {options: this.buildApiCallOptions(options)},
        );

        // TODO consider removing "ping" API or pinging once per "webView", keeping state in WeakMap<WebView, ...>?
        const ping$ = this.onlinePingWithTimeouts$.pipe(
            switchMap(({webViewApiPing: timeoutMs}) => {
                return race(
                    defer(() => {
                        return client("ping", {timeoutMs: ONE_SECOND_MS})({zoneName: logger.zoneName()});
                    }).pipe(
                        retryWhen((errors) => {
                            return errors.pipe(
                                delay(ONE_SECOND_MS),
                            );
                        }),
                    ),
                    timer(timeoutMs).pipe(
                        concatMap(() => {
                            return throwError(
                                new Error(
                                    `Failed to wait for "webview" service provider initialization (timeout: ${timeoutMs}ms).`,
                                ),
                            );
                        }),
                    ),
                );
            }),
        );

        return ping$.pipe(
            concatMap(() => {
                return of(client);
            }),
        );
    }

    ipcMainClient(options?: LimitedCallOptions) {
        return __ELECTRON_EXPOSURE__.buildIpcMainClient({
            options: this.buildApiCallOptions(options),
        });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private buildApiCallOptions(options: LimitedCallOptions = {}): SuperCallOptions {
        return {
            ...options,
            logger,
            timeoutMs: this.defaultApiCallTimeoutMs,
            notificationWrapper: this.ngZone.run.bind(this.ngZone),
        };
    }
}
