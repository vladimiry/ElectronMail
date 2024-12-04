import {createIpcMainApiService} from "electron-rpc-api";
import {Injectable, NgZone} from "@angular/core";
import {mergeMap} from "rxjs/operators";
import type {OnDestroy} from "@angular/core";
import {select, Store} from "@ngrx/store";
import {Subscription} from "rxjs";

import {DEFAULT_API_CALL_TIMEOUT} from "src/shared/const";
import {getWebLogger} from "src/web/browser-window/util";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

type SuperCallOptions = Required<Exclude<Parameters<ReturnType<(typeof createIpcMainApiService)>["client"]>[0], undefined>>["options"];

type LimitedCallOptions = Partial<Pick<SuperCallOptions, "timeoutMs" | "finishPromise" | "serialization">>;

const logger = getWebLogger(__filename);

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
                        const defined = config
                            && typeof config.timeouts === "object"
                            && typeof config.timeouts.defaultApiCall === "number";
                        return defined
                            ? [config.timeouts.defaultApiCall]
                            : [];
                    }),
                )
                .subscribe((value) => {
                    if (this.defaultApiCallTimeoutMs === value) {
                        return;
                    }
                    logger.info(`changing timeout from ${this.defaultApiCallTimeoutMs} to ${value}`);
                    this.defaultApiCallTimeoutMs = value;
                }),
        );
    }

    primaryCommonWebViewClient(
        {webView}: {webView: Electron.WebviewTag},
        options?: LimitedCallOptions,
    ): ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcPrimaryCommonWebViewClient> {
        return __ELECTRON_EXPOSURE__.buildIpcPrimaryCommonWebViewClient(
            webView,
            {options: this.buildApiCallOptions(options)},
        );
    }

    primaryLoginWebViewClient(
        {webView}: {webView: Electron.WebviewTag},
        options?: LimitedCallOptions,
    ): ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcPrimaryLoginWebViewClient> {
        return __ELECTRON_EXPOSURE__.buildIpcPrimaryLoginWebViewClient(
            webView,
            {options: this.buildApiCallOptions(options)},
        );
    }

    primaryMailWebViewClient(
        {webView}: {webView: Electron.WebviewTag},
        options?: LimitedCallOptions,
    ): ReturnType<typeof __ELECTRON_EXPOSURE__.buildIpcPrimaryMailWebViewClient> {
        return __ELECTRON_EXPOSURE__.buildIpcPrimaryMailWebViewClient(
            webView,
            {options: this.buildApiCallOptions(options)},
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

    private buildApiCallOptions(options: LimitedCallOptions = {}): SuperCallOptions {
        return {
            logger,
            timeoutMs: this.defaultApiCallTimeoutMs,
            notificationWrapper: this.ngZone.run.bind(this.ngZone),
            ...options,
        };
    }
}
