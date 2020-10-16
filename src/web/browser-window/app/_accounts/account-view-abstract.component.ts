import {Directive, ElementRef, EventEmitter, Injector, Input, OnDestroy, Output, ViewChild} from "@angular/core";
import {Observable, Subscription, race} from "rxjs";
import {distinctUntilChanged, filter, map, take} from "rxjs/operators";
import {pick} from "remeda";

import {AccountComponent} from "src/web/browser-window/app/_accounts/account.component";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {PACKAGE_VERSION} from "src/shared/constants";
import {WebAccount} from "src/web/browser-window/app/model";
import {getWebViewPartition} from "src/shared/util";

type ChildEvent = Parameters<typeof AccountComponent.prototype.onEventChild>[0];

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class AccountViewAbstractComponent extends NgChangesObservableComponent implements OnDestroy {
    @Input()
    readonly account!: WebAccount;

    readonly account$: Observable<WebAccount> = this.ngChangesObservable("account");

    readonly webViewPartition$ = this.account$.pipe(
        map(({accountConfig: {login}}) => login),
        distinctUntilChanged(),
        map((login) => getWebViewPartition(login)),
    );

    readonly webViewPreload = __METADATA__.electronLocations.preload[this.viewType];

    private webViewSrcValue = "";

    @Input()
    set webViewSrc(value: string) {
        this.event.emit({type: "log", data: ["verbose", "set webViewSrc"]});

        const {webView} = this;

        if (webView) {
            this.event.emit({type: "log", data: ["verbose", "set webViewSrc: registerWebViewEventsHandlingOnce()"]});
            this.registerWebViewEventsHandlingOnce(webView);
        }

        this.webViewSrcValue = value;
    }

    get webViewSrc(): string {
        return this.webViewSrcValue;
    }

    @Output()
    readonly event = new EventEmitter<ChildEvent>();

    protected readonly api: ElectronService = this.injector.get(ElectronService);

    protected readonly core: CoreService = this.injector.get(CoreService);

    private readonly subscription = new Subscription();

    @ViewChild("tplWebViewRef", {static: true})
    private tplWebViewRef: ElementRef<Electron.WebviewTag> | undefined;

    private get webView(): ElementRef<Electron.WebviewTag>["nativeElement"] | undefined {
        return this.tplWebViewRef?.nativeElement;
    }

    private readonly webViewAddMutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if ((node as Element).tagName === "WEBVIEW") {
                    this.event.emit({type: "log", data: ["info", "webViewAddMutationObserver: mounted to DOM"]});
                    this.event.emit({type: "log", data: ["verbose", "webViewAddMutationObserver: registerWebViewEventsHandlingOnce()"]});
                    this.registerWebViewEventsHandlingOnce(node as Electron.WebviewTag);
                    this.webViewAddMutationObserver.disconnect();
                }
            });
        }
    });

    protected constructor(
        private readonly viewType:
            Extract<keyof typeof __METADATA__.electronLocations.preload, "primary" /* | "calendar" */>,
        private readonly injector: Injector,
    ) {
        super();

        this.event.emit({type: "log", data: ["info", "constructor() abstract"]});

        const elementRef = injector.get<ElementRef<HTMLElement>>(ElementRef);

        this.addSubscription(
            (() => {
                this.webViewAddMutationObserver.observe(
                    elementRef.nativeElement,
                    {childList: true, subtree: true},
                );
                return {
                    unsubscribe: () => this.webViewAddMutationObserver.disconnect(),
                };
            })(),
        );

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
        this.event.emit({type: "log", data: ["info", `ngOnDestroy()`, ""]});
        this.subscription.unsubscribe();
        this.event.emit({
            type: "action",
            payload: this.injector
                .get(AccountsService)
                .generateNotificationsStateResetAction({login: this.account.accountConfig.login, optionalAccount: true}),
        });
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
            this.filterDomReadyEvent()
                .pipe(take(1)),
            this.ngOnDestroy$,
        ]).toPromise().then(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    }

    protected addSubscription(
        ...[teardown]: Parameters<typeof AccountViewAbstractComponent.prototype.subscription.add>
    ): ReturnType<typeof AccountViewAbstractComponent.prototype.subscription.add> {
        return this.subscription.add(teardown);
    }

    private registerWebViewEventsHandlingOnce(webView: Electron.WebviewTag): void {
        // making sure function called once
        this.registerWebViewEventsHandlingOnce = () => {
            this.event.emit({type: "log", data: ["info", "registerWebViewEventsHandlingOnce()", "noop"]});
        };

        this.event.emit({type: "log", data: ["info", "registerWebViewEventsHandlingOnce()"]});

        const domReadyArgs = [
            "dom-ready",
            ({type}: import("electron").Event) => {
                this.event.emit({type: "dom-ready", viewType: this.viewType, webView});
                this.event.emit({
                    type: "log",
                    data: [
                        "verbose",
                        "webview event",
                        JSON.stringify({type, src: webView.src}),
                    ],
                });
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
                    this.event.emit({
                        type: "log",
                        data: [
                            isWarn ? "warn" : "error",
                            "webview event",
                            JSON.stringify({type, level, message, line, sourceId}),
                        ],
                    });
                }
            },
        ] as const;
        const didFailLoadArgs = [
            "did-fail-load",
            (event: import("electron").DidFailLoadEvent) => {
                this.event.emit({
                    type: "log",
                    data: [
                        "error",
                        "webview event",
                        JSON.stringify(pick(event, ["type", "errorCode", "errorDescription", "validatedURL", "isMainFrame"])),
                    ],
                });
            },
        ] as const;
        const crashedArgs = [
            "crashed",
            (event: import("electron").Event) => {
                this.event.emit({
                    type: "log",
                    data: [
                        "error",
                        "webview event",
                        JSON.stringify(pick(event, ["type"])),
                    ],
                });
            },
        ] as const;
        const pluginCrashedArgs = [
            "plugin-crashed",
            (event: import("electron").PluginCrashedEvent) => {
                this.event.emit({
                    type: "log",
                    data: [
                        "error",
                        "webview event",
                        JSON.stringify(pick(event, ["type", "name", "version"])),
                    ],
                });
            },
        ] as const;

        // TODO TS: define events array/map and subscribe/unsubscribe in iteration
        //      it's currently not possible since TS doesn't support overloaded methods narrowing:
        //      - https://github.com/Microsoft/TypeScript/issues/26591
        //      - https://github.com/Microsoft/TypeScript/issues/25352
        webView.addEventListener(...domReadyArgs);
        webView.addEventListener(...newWindowArgs);
        webView.addEventListener(...consoleMessageArgs);
        webView.addEventListener(...didFailLoadArgs);
        webView.addEventListener(...crashedArgs);
        webView.addEventListener(...pluginCrashedArgs);

        this.event.emit({type: "log", data: ["info", `webview handlers subscribed`]});

        if (PACKAGE_VERSION.includes("-debug")) {
            const mark = "WEBVIEW_EVENTS_DEBUG";
            const log = (stringifiableProps: Record<string, unknown>): void => {
                this.event.emit({type: "log", data: ["verbose", mark, JSON.stringify(stringifiableProps)]});
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
            this.event.emit({type: "log", data: ["verbose", mark, "handlers subscribed"]});
        }

        this.subscription.add({
            unsubscribe: () => {
                webView.removeEventListener(...domReadyArgs);
                webView.removeEventListener(...newWindowArgs);
                webView.removeEventListener(...consoleMessageArgs);
                webView.removeEventListener(...didFailLoadArgs);
                webView.removeEventListener(...crashedArgs);
                webView.removeEventListener(...pluginCrashedArgs);

                this.event.emit({type: "log", data: ["info", `webview handlers unsubscribed`]});
            },
        });
    }
}
