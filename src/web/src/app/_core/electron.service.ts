import {Injectable, OnDestroy} from "@angular/core";
import {Observable, ObservableInput, Subscription, defer, of, throwError, timer} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concat, concatMap, delay, filter, map, mergeMap, retryWhen, switchMap, take, takeWhile, withLatestFrom} from "rxjs/operators";
import {createIpcMainApiService} from "electron-rpc-api";

import {AccountType} from "src/shared/model/account";
import {Arguments} from "src/shared/types";
import {DEFAULT_API_CALL_TIMEOUT, ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {PROTONMAIL_IPC_WEBVIEW_API} from "src/shared/api/webview/protonmail";
import {State} from "src/web/src/app/store/reducers/options";
import {TUTANOTA_IPC_WEBVIEW_API} from "src/shared/api/webview/tutanota";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

type SuperCallOptions = Required<Exclude<Arguments<ReturnType<(typeof createIpcMainApiService)>["client"]>[0], undefined>>["options"];

type CallOptions = Partial<Pick<SuperCallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

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
    ): Observable<ReturnType<(T extends "protonmail" ? typeof PROTONMAIL_IPC_WEBVIEW_API : typeof TUTANOTA_IPC_WEBVIEW_API)["client"]>> {
        // TODO TS: figure why "webViewClient()" client stopped to be type safe after some TS version update
        const client = __ELECTRON_EXPOSURE__.buildIpcWebViewClient[type](
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
                const pingDeferFactory: () => ObservableInput<void> = () => {
                    return client("ping", {timeoutMs: 1})({zoneName: logger.zoneName()});
                };

                return defer(pingDeferFactory).pipe(
                    retryWhen((errors) => errors.pipe(
                        takeWhile(() => (Date.now() - pingStart) < webViewApiPing),
                        delay(this.webViewApiPingIntervalMs),
                        concat(throwError(new Error(`Failed to wait for "webview:${type}" service provider initialization`))),
                    )),
                );
            }),
        );

        return ping$.pipe(
            concatMap(() => {
                return of(client as any); // TODO TS: get rid of typecasting
            }),
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

    private buildApiCallOptions(options: CallOptions = {}): SuperCallOptions {
        return {
            timeoutMs: this.defaultApiCallTimeoutMs,
            notificationWrapper: Zone.current.run.bind(Zone.current),
            ...options,
        };
    }
}
