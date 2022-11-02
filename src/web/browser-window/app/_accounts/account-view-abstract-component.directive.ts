import type {Action} from "@ngrx/store";
import {combineLatest, EMPTY, Observable, of, race, Subscription} from "rxjs";
import {Directive, ElementRef, EventEmitter, Injector, Input, Output, Renderer2} from "@angular/core";
import {distinctUntilChanged, filter, map, mergeMap, switchMap, take} from "rxjs/operators";
import {DOCUMENT} from "@angular/common";
import type {OnDestroy} from "@angular/core";
import {pick} from "remeda";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountViewComponent} from "./account-view.component";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {depersonalizeLoggedUrlsInString} from "src/shared/util/proton-url";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {getWebViewPartitionName} from "src/shared/util/proton-webclient";
import {LogLevel} from "src/shared/model/common";
import {lowerConsoleMessageEventLogLevel} from "src/shared/util";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {WebAccount} from "src/web/browser-window/app/model";

type ChildEvent = Parameters<typeof AccountViewComponent.prototype.onEventChild>[0];

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class AccountViewAbstractComponent extends NgChangesObservableComponent implements OnDestroy {
    @Input()
    readonly login: string = "";

    readonly account$: Observable<WebAccount>;

    @Input()
    webViewSrc!: string;

    @Output()
    private readonly event = new EventEmitter<ChildEvent>();

    private webView?: Electron.WebviewTag;

    protected readonly api: ElectronService;

    protected readonly core: CoreService;

    private readonly subscription = new Subscription();

    protected constructor(
        private readonly viewType:
            Extract<keyof typeof __METADATA__.electronLocations.preload, "primary" | "calendar">,
        private readonly injector: Injector,
    ) {
        super();

        this.account$ = this.ngChangesObservable("login").pipe(
            switchMap((login) => this.injector.get(Store).pipe(
                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                mergeMap((account) => account ? [account] : EMPTY),
            )),
        );
        this.api = this.injector.get(ElectronService);
        this.core = this.injector.get(CoreService);

        this.log("info", [nameof(AccountViewAbstractComponent), "constructor"]);

        this.webViewConstruction();

        {
            let customCssKey: string | undefined;
            this.addSubscription(
                combineLatest([
                    this.filterDomReadyEvent(),
                    this.account$.pipe(
                        map(({accountConfig: {customCSS}}) => customCSS),
                        distinctUntilChanged(),
                    ),
                ]).subscribe(async ([{webView}, customCSS]) => {
                    if (customCssKey) {
                        this.log("verbose", ["removing custom css"]);
                        await webView.removeInsertedCSS(customCssKey);
                        customCssKey = undefined;
                    }
                    if (!customCSS?.trim()) {
                        return;
                    }
                    this.log("verbose", ["inserting custom css"]);
                    customCssKey = await webView.insertCSS(customCSS);
                }),
            );
        }

        if (BUILD_ENVIRONMENT === "development") {
            this.addSubscription(
                this.filterDomReadyEvent()
                    .pipe(take(1))
                    .subscribe(({webView}) => webView.openDevTools()),
            );
        }
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.log("info", [nameof(AccountViewAbstractComponent.prototype.ngOnDestroy)]);
        this.subscription.unsubscribe();
        this.action(
            ACCOUNTS_ACTIONS.Patch({login: this.login, patch: {webviewSrcValues: {[this.viewType]: ""}}, optionalAccount: true}),
        );
    }

    protected log(level: LogLevel, args: string[]): void {
        this.event.emit({type: "log", data: [level, ...args]});
    }

    protected action(payload: Action): void {
        this.event.emit({type: "action", payload});
    }

    protected filterDomReadyEvent(): Observable<Extract<ChildEvent, { type: "dom-ready" }>> {
        return this.event.pipe(
            filter(({type}) => type === "dom-ready"),
            // TODO TS drop type casting "map" https://github.com/microsoft/TypeScript/issues/16069 (or use "mergeMap", see below)
            map((event) => event as Extract<Unpacked<typeof AccountViewAbstractComponent.prototype.event>, { type: "dom-ready" }>),
            // mergeMap((event) => event.type === "dom-ready" ? [event] : []),
        );
    }

    protected domReadyOrDestroyedSingleNotification(): Observable<void> {
        return race(
            this.filterDomReadyEvent(),
            this.ngOnDestroy$,
        ).pipe(
            take(1),
            mergeMap(() => of(((): void => {})())), // eslint-disable-line @typescript-eslint/no-empty-function
        );
    }

    protected addSubscription(
        ...[teardown]: Parameters<typeof AccountViewAbstractComponent.prototype.subscription.add>
    ): ReturnType<typeof AccountViewAbstractComponent.prototype.subscription.add> {
        return this.subscription.add(teardown);
    }

    private webViewConstruction(): void {
        this.addSubscription(
            combineLatest([
                this.ngChangesObservable("webViewSrc").pipe(
                    filter(Boolean), // empty "src" shouldn't trigger webview adding
                    distinctUntilChanged(),
                ),
                this.account$.pipe(
                    map(({accountConfig: {login, entryUrl}}) => getWebViewPartitionName({login, entryUrl})),
                ),
            ]).pipe(
                map(([src, partition]) => ({src, partition})),
                distinctUntilChanged(({partition: prev}, {partition: curr}) => curr === prev),
                // from the https://www.electronjs.org/docs/latest/api/webview-tag doc:
                //   the "partition" value can only be modified before the first navigation
                //   since the session of an active renderer process cannot change
                // processing only one notification as "webview.partition" can't be changed
                // the entire component gets re-created via the "unload" action
                take(1),
            ).subscribe(({src, partition}) => {
                { // creating
                    const document = this.injector.get(DOCUMENT);
                    this.webView = document.createElement("webView") as Electron.WebviewTag;
                    this.registerWebViewEventsHandlingOnce(this.webView);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    Object.assign(this.webView, {src, partition, preload: __METADATA__.electronLocations.preload[this.viewType]});
                }
                { // mounting
                    const elementRef = this.injector.get<ElementRef<HTMLElement>>(ElementRef);
                    const renderer2 = this.injector.get(Renderer2);
                    renderer2.appendChild(elementRef.nativeElement, this.webView);
                }
            }),
        );
    }

    private registerWebViewEventsHandlingOnce(webView: Electron.WebviewTag): void {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.log("info", [nameof(AccountViewAbstractComponent.prototype.registerWebViewEventsHandlingOnce)]);

        const didNavigateArgs = [
            "did-navigate",
            ({url}: import("electron").DidNavigateEvent) => {
                this.action(
                    ACCOUNTS_ACTIONS.Patch({login: this.login, patch: {webviewSrcValues: {[this.viewType]: url}}}),
                );
            },
        ] as const;
        const domReadyArgs = [
            "dom-ready",
            ({type}: import("electron").Event) => {
                this.event.emit({type: "dom-ready", viewType: this.viewType, webView});
                this.log("verbose", ["webview event", JSON.stringify({type, src: webView.src})]);
            },
        ] as const;
        const consoleMessageArgs = [
            "console-message",
            ({type, level, message, line, sourceId}: import("electron").ConsoleMessageEvent) => {
                const isWarn = Number(level) === 2;
                const isError = Number(level) === 3;
                if (isWarn || isError) {
                    this.log(
                        lowerConsoleMessageEventLogLevel(isWarn ? "warn" : "error", message),
                        ["webview event", JSON.stringify({type, level, message: depersonalizeLoggedUrlsInString(message), line, sourceId})],
                    );
                }
            },
        ] as const;
        const didFailLoadArgs = [
            "did-fail-load",
            (event: import("electron").DidFailLoadEvent) => {
                this.log(
                    "error",
                    [
                        "webview event",
                        JSON.stringify(pick(event, ["type", "errorCode", "errorDescription", "validatedURL", "isMainFrame"])),
                    ],
                );
            },
        ] as const;
        const crashedArgs = [
            "crashed",
            (event: import("electron").Event) => {
                this.log("error", ["webview event", JSON.stringify(pick(event, ["type"]))]);
            },
        ] as const;
        const pluginCrashedArgs = [
            "plugin-crashed",
            (event: import("electron").PluginCrashedEvent) => {
                this.log("error", ["webview event", JSON.stringify(pick(event, ["type", "name", "version"]))]);
            },
        ] as const;

        // TODO TS: define events array/map and subscribe/unsubscribe in iteration
        //      it's currently not possible since TS doesn't support overloaded methods narrowing:
        //      - https://github.com/Microsoft/TypeScript/issues/26591
        //      - https://github.com/Microsoft/TypeScript/issues/25352
        webView.addEventListener(...didNavigateArgs);
        webView.addEventListener(...domReadyArgs);
        webView.addEventListener(...consoleMessageArgs);
        webView.addEventListener(...didFailLoadArgs);
        webView.addEventListener(...crashedArgs);
        webView.addEventListener(...pluginCrashedArgs);

        this.log("info", ["webview handlers subscribed"]);

        this.addSubscription({
            unsubscribe: () => {
                webView.removeEventListener(...didNavigateArgs);
                webView.removeEventListener(...domReadyArgs);
                webView.removeEventListener(...consoleMessageArgs);
                webView.removeEventListener(...didFailLoadArgs);
                webView.removeEventListener(...crashedArgs);
                webView.removeEventListener(...pluginCrashedArgs);

                this.log("info", ["webview handlers unsubscribed"]);
            },
        });
    }
}
