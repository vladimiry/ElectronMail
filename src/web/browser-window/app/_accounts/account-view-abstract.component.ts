import {DOCUMENT} from "@angular/common";
import {Directive, ElementRef, EventEmitter, Injector, Input, OnDestroy, Output, Renderer2} from "@angular/core";
import {Observable, Subscription, combineLatest, race} from "rxjs";
import {distinctUntilChanged, filter, map, take} from "rxjs/operators";
import {equals, pick} from "remeda";

import {ACCOUNTS_ACTIONS, AppAction, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountComponent} from "src/web/browser-window/app/_accounts/account.component";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {LogLevel} from "src/shared/model/common";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {PACKAGE_VERSION} from "src/shared/constants";
import {WebAccount} from "src/web/browser-window/app/model";
import {getWebViewPartition, lowerConsoleMessageEventLogLevel} from "src/shared/util";

type ChildEvent = Parameters<typeof AccountComponent.prototype.onEventChild>[0];

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class AccountViewAbstractComponent extends NgChangesObservableComponent implements OnDestroy {
    @Input()
    readonly account!: WebAccount;

    readonly account$: Observable<WebAccount> = this.ngChangesObservable("account");

    @Input()
    webViewSrc!: string;

    @Output()
    private readonly event = new EventEmitter<ChildEvent>();

    protected readonly api: ElectronService = this.injector.get(ElectronService);

    protected readonly core: CoreService = this.injector.get(CoreService);

    private readonly subscription = new Subscription();

    protected constructor(
        private readonly viewType:
            Extract<keyof typeof __METADATA__.electronLocations.preload, "primary" | "calendar">,
        private readonly injector: Injector,
    ) {
        super();

        this.log("info", ["constructor() abstract"]);

        this.webViewConstruction();

        {
            let customCssKey: string | undefined;

            this.subscription.add(
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

        this.subscription.add(
            this.filterDomReadyEvent()
                .pipe(take(1))
                .subscribe(({webView}) => {
                    if ((BUILD_ENVIRONMENT === "development")) {
                        webView.openDevTools();
                    }
                }),
        );
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.log("info", ["ngOnDestroy()"]);
        this.subscription.unsubscribe();
        this.action(
            ACCOUNTS_ACTIONS.Patch(
                {login: this.account.accountConfig.login, patch: {webviewSrcValues: {[this.viewType]: ""}}, optionalAccount: true},
            ),
        );
    }

    protected log(level: LogLevel, args: string[]): void {
        this.event.emit({type: "log", data: [level, ...args]});
    }

    protected action(payload: AppAction): void {
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

    protected async filterDomReadyOrDestroyedPromise(): Promise<void> {
        return race([
            this.filterDomReadyEvent().pipe(take(1)),
            this.ngOnDestroy$,
        ]).toPromise().then(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    }

    protected addSubscription(
        ...[teardown]: Parameters<typeof AccountViewAbstractComponent.prototype.subscription.add>
    ): ReturnType<typeof AccountViewAbstractComponent.prototype.subscription.add> {
        return this.subscription.add(teardown);
    }

    private webViewConstruction(): void {
        let webView: Electron.WebviewTag | undefined;

        this.subscription.add(
            combineLatest([
                this.ngChangesObservable("webViewSrc"),
                this.account$.pipe(map(({accountConfig: {login}}) => getWebViewPartition(login))),
            ]).pipe(
                map(([src, partition]) => ({src, partition})),
                distinctUntilChanged((prev, curr) => equals(prev, curr)), // TODO => "distinctUntilChanged(equals)",
            ).subscribe(({src, partition}) => {
                // TODO consider removing the webview and creating/mounting-to-DOM new instance rather than reusing once created
                if (!webView) {
                    const document = this.injector.get(DOCUMENT);
                    webView = document.createElement("webView") as Electron.WebviewTag;
                    this.registerWebViewEventsHandlingOnce(webView);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    Object.assign(webView, {src, partition, preload: __METADATA__.electronLocations.preload[this.viewType]});
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    webView.src = src;
                }
                if (!webView.parentNode) {
                    const elementRef = this.injector.get<ElementRef<HTMLElement>>(ElementRef);
                    const renderer2 = this.injector.get(Renderer2);
                    renderer2.appendChild(elementRef.nativeElement, webView);
                }
            }),
        );
    }

    private registerWebViewEventsHandlingOnce(webView: Electron.WebviewTag): void {
        this.log("info", ["registerWebViewEventsHandlingOnce()"]);

        const didNavigateArgs = [
            "did-navigate",
            ({url}: import("electron").DidNavigateEvent) => {
                this.action(
                    ACCOUNTS_ACTIONS.Patch(
                        {login: this.account.accountConfig.login, patch: {webviewSrcValues: {[this.viewType]: url}}},
                    ),
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
        const newWindowArgs = [
            "new-window",
            ({url}: import("electron").NewWindowEvent) => {
                this.event.emit({type: "action", payload: NAVIGATION_ACTIONS.OpenExternal({url})});
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
                        ["webview event", JSON.stringify({type, level, message, line, sourceId})],
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
        webView.addEventListener(...newWindowArgs);
        webView.addEventListener(...consoleMessageArgs);
        webView.addEventListener(...didFailLoadArgs);
        webView.addEventListener(...crashedArgs);
        webView.addEventListener(...pluginCrashedArgs);

        this.log("info", ["webview handlers subscribed"]);

        if (PACKAGE_VERSION.includes("-debug")) {
            const mark = "WEBVIEW_EVENTS_DEBUG";
            const log = (stringifiableProps: Record<string, unknown>): void => {
                this.log("verbose", [mark, JSON.stringify(stringifiableProps)]);
            };
            /* eslint-disable max-len */
            webView.addEventListener("load-commit", (event) => log(pick(event, ["type", "url", "isMainFrame"])));
            webView.addEventListener("did-finish-load", (event) => log(pick(event, ["type"])));
            // webView.addEventListener("did-fail-load", (event) => log(pick(event, ["type", "errorCode", "errorDescription", "validatedURL", "isMainFrame"])));
            webView.addEventListener("did-frame-finish-load", (event) => log(pick(event, ["type", "isMainFrame"])));
            webView.addEventListener("did-start-loading", (event) => log(pick(event, ["type"])));
            webView.addEventListener("did-stop-loading", (event) => log(pick(event, ["type"])));
            // webView.addEventListener("dom-ready", (event) => log(pick(event, ["type"])));
            webView.addEventListener("page-title-updated", (event) => log(pick(event, ["type", "title", "explicitSet"])));
            webView.addEventListener("page-favicon-updated", (event) => log(pick(event, ["type", "favicons"])));
            webView.addEventListener("console-message", (event) => log(pick(event, ["type", "level", "message", "line", "sourceId"])));
            webView.addEventListener("will-navigate", (event) => log(pick(event, ["type", "url"])));
            webView.addEventListener("did-navigate", (event) => log(pick(event, ["type", "url"])));
            webView.addEventListener("did-navigate-in-page", (event) => log(pick(event, ["type", "url", "isMainFrame"])));
            webView.addEventListener("close", (event) => log(pick(event, ["type"])));
            webView.addEventListener("ipc-message", (event) => log(pick(event, ["type", "channel"/*, "args"*/]))); // WARN "args" might include sensitive data, so excluded
            // webView.addEventListener("crashed", (event) => log(pick(event, ["type"])));
            // webView.addEventListener("plugin-crashed", (event) => log(pick(event, ["type", "name", "version"])));
            webView.addEventListener("destroyed", (event) => log(pick(event, ["type"])));
            // webView.addEventListener("update-target-url", (event) => log(pick(event, ["type", "url"])));
            /* eslint-enable max-len */
            this.log("verbose", [mark, "handlers subscribed"]);
        }

        this.subscription.add({
            unsubscribe: () => {
                webView.removeEventListener(...didNavigateArgs);
                webView.removeEventListener(...domReadyArgs);
                webView.removeEventListener(...newWindowArgs);
                webView.removeEventListener(...consoleMessageArgs);
                webView.removeEventListener(...didFailLoadArgs);
                webView.removeEventListener(...crashedArgs);
                webView.removeEventListener(...pluginCrashedArgs);

                this.log("info", ["webview handlers unsubscribed"]);
            },
        });
    }
}
