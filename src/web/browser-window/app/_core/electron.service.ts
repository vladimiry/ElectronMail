import {concatMap, delay, mergeMap, retryWhen, switchMap, take} from "rxjs/operators";
import {createIpcMainApiService} from "electron-rpc-api";
import {defer, Observable, of, race, Subscription, throwError, timer} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import type {OnDestroy} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/const";
import {getWebLogger} from "src/web/browser-window/util";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PROTON_CALENDAR_IPC_WEBVIEW_API_DEFINITION} from "src/shared/api/webview/calendar";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {WebAccountIndexProp} from "src/web/browser-window/app/model";

type SuperCallOptions = Required<Exclude<Parameters<ReturnType<(typeof createIpcMainApiService)>["client"]>[0], undefined>>["options"];

type LimitedCallOptions = Partial<Pick<SuperCallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getWebLogger(__filename);

export class WebviewPingFailedError extends Error {
    constructor(message: string) {
        super(message);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, WebviewPingFailedError);
        }
        this.name = nameof(WebviewPingFailedError);
    }
}

@Injectable()
export class ElectronService implements OnDestroy {
    private defaultApiCallTimeoutMs = DEFAULT_API_CALL_TIMEOUT;
    private readonly subscription = new Subscription();

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

    primaryWebViewClient(
        {webView, accountIndex}: { webView: Electron.WebviewTag } & WebAccountIndexProp,
        options?: LimitedCallOptions & { pingTimeoutMs?: number },
    ): Observable<ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcPrimaryWebViewClient>> {
        const client = __ELECTRON_EXPOSURE__.buildIpcPrimaryWebViewClient(
            webView,
            {options: this.buildApiCallOptions(options)},
        );
        return this.store.pipe(select(OptionsSelectors.CONFIG.timeouts)).pipe(
            take(1),
            switchMap(({webViewApiPing: timeoutMs}) => {
                return this.raceWebViewClient({client, accountIndex}, options?.pingTimeoutMs ?? timeoutMs);
            }),
            mergeMap(() => of(client)),
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
            concatMap(() => of(client)),
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
            defer(async () => client("ping", {timeoutMs: ONE_SECOND_MS})({accountIndex})).pipe(
                retryWhen((errors) => errors.pipe(delay(ONE_SECOND_MS))),
            ),
            timer(timeoutMs).pipe(
                concatMap(() => {
                    return throwError(() => {
                        return new WebviewPingFailedError(`Failed to ping the "webview" backend service (timeout: ${timeoutMs}ms).`);
                    });
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
