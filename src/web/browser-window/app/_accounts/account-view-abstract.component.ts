import {Directive, ElementRef, EventEmitter, Injector, Input, OnDestroy, OnInit, Output, ViewChild} from "@angular/core";
import {Observable, Subscription, race} from "rxjs";
import {distinctUntilChanged, filter, map, take} from "rxjs/operators";

import {AccountComponent} from "src/web/browser-window/app/_accounts/account.component";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {WebAccount} from "src/web/browser-window/app/model";
import {getWebViewPartition} from "src/shared/util";

type ChildEvent = Parameters<typeof AccountComponent.prototype.onEventChild>[0];

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class AccountViewAbstractComponent extends NgChangesObservableComponent implements OnInit, OnDestroy {
    @Input()
    readonly account!: WebAccount;

    readonly account$: Observable<WebAccount> = this.ngChangesObservable("account");

    readonly webViewPartition$ = this.account$.pipe(
        map(({accountConfig: {login}}) => login),
        distinctUntilChanged(),
        map((login) => getWebViewPartition(login)),
    );

    readonly webViewPreload = __METADATA__.electronLocations.preload[this.viewType];

    @Input()
    readonly webViewSrc!: string;

    @Output()
    readonly event = new EventEmitter<ChildEvent>();

    protected readonly api: ElectronService = this.injector.get(ElectronService);

    protected readonly core: CoreService = this.injector.get(CoreService);

    private readonly subscription = new Subscription();

    @ViewChild("tplWebViewRef", {static: true})
    private tplWebViewRef!: ElementRef<Electron.WebviewTag>;

    private get webView(): ElementRef<Electron.WebviewTag>["nativeElement"] {
        return this.tplWebViewRef.nativeElement;
    }

    protected constructor(
        private readonly viewType:
            Extract<keyof typeof __METADATA__.electronLocations.preload, "primary" /* | "calendar" */>,
        private readonly injector: Injector,
    ) {
        super();
    }

    ngOnInit(): void {
        this.registerWebViewEventsHandling();

        // this.subscription.add(
        //     this.filterDomReadyEvent()
        //         .pipe(take(1))
        //         .subscribe(({webView}) => {
        //             if ((BUILD_ENVIRONMENT === "development")) {
        //                 webView.openDevTools();
        //             }
        //         }),
        // );
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.event.emit({type: "log", data: ["info", `ngOnDestroy()`, ""]});
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

    private registerWebViewEventsHandling(): void {
        this.event.emit({type: "log", data: ["info", `registerWebViewEvents()`]});

        const {webView} = this;

        webView.addEventListener("new-window", ({url}) => {
            this.event.emit({type: "action", payload: NAVIGATION_ACTIONS.OpenExternal({url})});
        });

        (() => {
            const listenerArgs = [
                "dom-ready",
                () => {
                    this.event.emit({type: "log", data: ["verbose", `webview dom-ready handler, "${webView.src}"`]});
                    this.event.next({type: "dom-ready", viewType: this.viewType, webView});
                },
            ] as const;

            webView.addEventListener(...listenerArgs);
            this.event.emit({type: "log", data: ["info", `webview dom-ready handler subscribed`]});

            this.subscription.add({
                unsubscribe: () => {
                    webView.removeEventListener(...listenerArgs);
                    this.event.emit({type: "log", data: ["info", `webview dom-ready handler unsubscribed`]});
                },
            });
        })();
    }
}
