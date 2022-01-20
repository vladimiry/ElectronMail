import {concatMap, delay, filter, map, mergeMap, retryWhen, switchMap, take, withLatestFrom} from "rxjs/operators";
import {createIpcMainApiService} from "electron-rpc-api";
import {defer, Observable, of, race, Subscription, throwError, timer} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import type {OnDestroy} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {Config} from "src/shared/model/options";
import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/constants";
import {getWebLogger} from "src/web/browser-window/util";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PROTON_CALENDAR_IPC_WEBVIEW_API_DEFINITION} from "src/shared/api/webview/calendar";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {WebAccountIndexProp} from "src/web/browser-window/app/model";

type SuperCallOptions = Required<Exclude<Parameters<ReturnType<(typeof createIpcMainApiService)>["client"]>[0], undefined>>["options"];

type LimitedCallOptions = Partial<Pick<SuperCallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getWebLogger(__filename);

@Injectable()
export class ElectronService implements OnDestroy {
    private defaultApiCallTimeoutMs = DEFAULT_API_CALL_TIMEOUT;
    private readonly subscription = new Subscription();
    private readonly onlinePingWithTimeouts$: Observable<Config["timeouts"]>;

    constructor(
        private store: Store<State>,
        private ngZone: NgZone,
    ) {
        this.onlinePingWithTimeouts$ = timer(0, ONE_SECOND_MS).pipe(
            filter(() => navigator.onLine),
            take(1),
            withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.timeouts))),
            map(([, timeouts]) => timeouts),
        );
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

    primaryWebViewClient(
        {webView, accountIndex}: { webView: Electron.WebviewTag } & WebAccountIndexProp,
        options?: LimitedCallOptions,
    ): Observable<ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcPrimaryWebViewClient>> {
        const client = __ELECTRON_EXPOSURE__.buildIpcPrimaryWebViewClient(
            webView,
            {options: this.buildApiCallOptions(options)},
        );

        // TODO consider removing "ping" API or pinging once per "webView", keeping state in WeakMap<WebView, ...>?
        return this.onlinePingWithTimeouts$.pipe(
            switchMap(({webViewApiPing: timeoutMs}) => this.raceWebViewClient({client, accountIndex}, timeoutMs)),
            concatMap(() => {
                return of(client);
            }),
        );
    }

    calendarWebViewClient(
        {webView, accountIndex}: { webView: Electron.WebviewTag } & WebAccountIndexProp,
        options?: LimitedCallOptions,
    ): Observable<ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcCalendarWebViewClient>> {
        const client = __ELECTRON_EXPOSURE__.buildIpcCalendarWebViewClient(
            webView,
            {options: this.buildApiCallOptions(options)},
        );

        // TODO consider removing "ping" API or pinging once per "webView", keeping state in WeakMap<WebView, ...>?
        return this.store.pipe(
            select(OptionsSelectors.CONFIG.timeouts),
            switchMap(({webViewApiPing: timeoutMs}) => this.raceWebViewClient({client, accountIndex}, timeoutMs)),
            concatMap(() => {
                return of(client);
            }),
        );
    }

    ipcMainClient(options?: LimitedCallOptions): ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcMainClient> {
        return __ELECTRON_EXPOSURE__.buildIpcMainClient({
            options: this.buildApiCallOptions(options),
        });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    // TODO TS: simplify method signature
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    private raceWebViewClient<T extends ReturnType<import("pubsub-to-rpc-api")
        .Model
        .CreateServiceReturn<Pick<(typeof PROTON_CALENDAR_IPC_WEBVIEW_API_DEFINITION), "ping">,
        [import("electron").IpcMessageEvent]>["caller"]>>(
        {client, accountIndex}: { client: T } & WebAccountIndexProp,
        timeoutMs: number,
    ) {
        return race(
            defer(async () => {
                return client("ping", {timeoutMs: ONE_SECOND_MS})({accountIndex});
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
    }

    private buildApiCallOptions(options: LimitedCallOptions = {}): SuperCallOptions {
        return {
            logger,
            timeoutMs: this.defaultApiCallTimeoutMs,
            notificationWrapper: this.ngZone.run.bind(this.ngZone),
            ...options,
        };
    }
}
