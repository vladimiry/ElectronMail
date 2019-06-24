import {Action, Store, select} from "@ngrx/store";
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    TemplateRef,
    ViewChild,
    ViewContainerRef,
    ViewRef,
} from "@angular/core";
import {Deferred} from "ts-deferred";
import {Subject, Subscription, combineLatest} from "rxjs";
import {debounceTime, distinctUntilChanged, filter, map, mergeMap, pairwise, startWith, withLatestFrom} from "rxjs/operators";
import {equals, pick} from "ramda";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {DbViewModuleResolve} from "src/web/browser-window/app/_accounts/db-view-module-resolve.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS, PRODUCT_NAME} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";
import {getWebViewPartition} from "src/shared/util";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

type WebViewSubjectState =
    | { action: "attrs"; src: string; preload: string; }
    | { action: "visibility"; visible: boolean; };

let componentIndex = 0;

const pickCredentialFields = ((fields: Array<keyof AccountConfig>) => {
    return (accountConfig: AccountConfig) => pick(fields, accountConfig);
})(["credentials"]);

const pickLoginDelayFields = ((fields: Array<keyof AccountConfig>) => {
    return (accountConfig: AccountConfig) => pick(fields, accountConfig);
})(["loginDelayUntilSelected", "loginDelaySecondsRange"]);

// TODO split account.component.ts component to pieces
@Component({
    selector: "electron-mail-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent extends NgChangesObservableComponent implements OnInit, AfterViewInit, OnDestroy {
    @Input()
    account!: WebAccount;
    account$ = this.ngChangesObservable("account");
    afterFailedLoadWait: number = 0;
    didFailLoadErrorDescription?: string;
    private logger: ReturnType<typeof getZoneNameBoundWebLogger>;
    private loggerZone: Zone;
    @ViewChild("dbViewContainer", {read: ViewContainerRef, static: false})
    private dbViewContainerRef!: ViewContainerRef;
    @ViewChild("webViewTemplate", {read: TemplateRef, static: false})
    private webViewTemplate!: TemplateRef<null>;
    @ViewChild("webviewContainer", {read: ViewContainerRef, static: false})
    private webViewContainerRef!: ViewContainerRef;
    private webViewState$ = new Subject<WebViewSubjectState>();
    private subscription = new Subscription();
    private domReadySubscription = new Subscription();
    private onWebViewDomReadyDeferreds: Array<Deferred<void>> = [];
    private readonly componentIndex: number;

    constructor(
        private dbViewModuleResolve: DbViewModuleResolve,
        private api: ElectronService,
        private core: CoreService,
        private store: Store<State>,
        private zone: NgZone,
        private changeDetectorRef: ChangeDetectorRef,
        private elementRef: ElementRef,
    ) {
        super();
        this.componentIndex = componentIndex;
        const loggerPrefix = `[account.component][${componentIndex++}]`;
        this.loggerZone = Zone.current.fork({name: loggerPrefix});
        this.logger = getZoneNameBoundWebLogger(loggerPrefix);
        this.logger.info(`constructor()`);
    }

    ngOnInit() {
        this.subscription.add(
            this.account$
                .pipe(
                    withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.unreadNotifications))),
                    filter(([, unreadNotifications]) => Boolean(unreadNotifications)),
                    map(([account]) => account),
                    map((a) => ({login: a.accountConfig.login, unread: a.notifications.unread})),
                    pairwise(),
                    filter(([prev, curr]) => curr.unread > prev.unread),
                    map(([, curr]) => curr),
                )
                .subscribe(({login, unread}) => {
                    new Notification(
                        PRODUCT_NAME,
                        {
                            body: `Account [${this.componentIndex}]: ${unread} unread message${unread > 1 ? "s" : ""}.`,
                        },
                    ).onclick = () => this.zone.run(() => {
                        this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.Activate({login}));
                        this.dispatchInLoggerZone(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                    });
                }),
        );
    }

    ngAfterViewInit() {
        this.logger.info(`ngAfterViewInit()`);

        const resolveWebView: () => Electron.WebviewTag = () => {
            const webView: Electron.WebviewTag | undefined = this.elementRef.nativeElement.querySelector("webview");
            if (!webView) {
                throw new Error(`"webview" element is supposed to be mounted to DOM at this stage`);
            }
            return webView;
        };

        // tslint:disable-next-line:no-floating-promises
        this.setupOnWebViewDomReadyDeferred().promise
            .then(() => {
                this.onWebViewLoadedOnce(resolveWebView());
                // if ((process.env.NODE_ENV/* as BuildEnvironment*/) === "development") {
                //     resolveWebView().openDevTools();
                // }
            });

        this.subscription.add(
            (() => {
                const hideClass = "webview-hidden";
                let view: ViewRef | undefined;

                return this.webViewState$.subscribe((value) => {
                    if (value.action === "attrs") {
                        if (!view) {
                            view = this.webViewTemplate.createEmbeddedView(null);
                            this.webViewContainerRef.insert(view);
                            this.registerWebViewEvents(resolveWebView());
                        }

                        const webView = resolveWebView();

                        if (!webView.src) {
                            // WARN: partition setting needs to occur before first navigation (before "src" setting)
                            webView.partition = getWebViewPartition(this.account.accountConfig.login);
                            webView.preload = value.preload;
                            webView.src = value.src;

                            this.logger.verbose(
                                `webview.attrs (initialize):`,
                                JSON.stringify(pick(["src", "preload", "partition"], webView)),
                            );
                        } else {
                            webView.src = value.src;
                            this.logger.verbose(`webview.attrs (update):`, webView.src);
                        }

                        return;
                    }

                    // TODO webview gets reloaded on re-inserting to DOM, so we show/hide parent element for now

                    if (value.visible) {
                        // this.view.insert(view);
                        this.elementRef.nativeElement.classList.remove(hideClass);
                        return;
                    }

                    // view = this.webViewContainerRef.detach();
                    this.elementRef.nativeElement.classList.add(hideClass);
                });
            })(),
        );

        this.subscription.add(
            combineLatest(
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.electronLocations),
                    mergeMap((electronLocations) => electronLocations ? [electronLocations] : []),
                ),
                this.account$.pipe(
                    distinctUntilChanged((prev, curr) => prev.accountConfig.entryUrl === curr.accountConfig.entryUrl),
                ),
            ).subscribe(([electronLocations, {accountConfig}]) => {
                const {type} = accountConfig;
                const parsedEntryUrl = this.core.parseEntryUrl(accountConfig, electronLocations);

                this.webViewState$.next({
                    action: "attrs",
                    src: parsedEntryUrl.entryUrl,
                    preload: electronLocations.preload.webView[type],
                });
            }),
        );
    }

    ngOnDestroy() {
        this.logger.info(`ngOnDestroy()`);
        this.subscription.unsubscribe();
        this.resolveOnWebViewDomReadyDeferreds();
    }

    private onWebViewLoadedOnce(webView: Electron.WebviewTag) {
        this.logger.info(`onWebViewLoadedOnce()`);

        this.subscription.add(
            ((state: { dbViewComponentRef?: Unpacked<ReturnType<typeof DbViewModuleResolve.prototype.buildComponentRef>> } = {}) => {
                return this.account$
                    .pipe(
                        map((account) => ({
                            type: account.accountConfig.type,
                            login: account.accountConfig.login,
                            databaseView: account.databaseView,
                        })),
                        distinctUntilChanged(({databaseView: prev}, {databaseView: curr}) => prev === curr),
                        withLatestFrom(this.store.pipe(select(AccountsSelectors.FEATURED.selectedLogin))),
                    )
                    .subscribe(async ([{type, login, databaseView}, selectedLogin]) => {
                        if (state.dbViewComponentRef) {
                            state.dbViewComponentRef.instance.setVisibility(Boolean(databaseView));
                        } else if (databaseView) {
                            state.dbViewComponentRef = await this.dbViewModuleResolve.buildComponentRef({type, login});
                            this.dbViewContainerRef.insert(state.dbViewComponentRef.hostView);
                            state.dbViewComponentRef.changeDetectorRef.detectChanges();
                        }

                        this.webViewState$.next({action: "visibility", visible: !databaseView});

                        if (!databaseView) {
                            setTimeout(() => this.focusWebView(webView));
                        }

                        if (this.account.accountConfig.login === selectedLogin) {
                            await this.sendSelectAccountNotification(webView);
                        }
                    });
            })(),
        );

        this.subscription.add(
            this.account$.pipe(
                pairwise(),
                filter(([prev, curr]) => {
                    return (
                        // page changed: "entryUrl" is changeable, ie need to react on "url" change too (deep comparison with "equals")
                        curr.notifications.pageType.type !== "unknown" && !equals(prev.notifications.pageType, curr.notifications.pageType)
                    ) || (
                        // creds changed
                        !equals(pickCredentialFields(prev.accountConfig), pickCredentialFields(curr.accountConfig))
                    ) || (
                        // login delay values changed
                        !equals(pickLoginDelayFields(prev.accountConfig), pickLoginDelayFields(curr.accountConfig))
                    );
                }),
                map(([, curr]) => curr),
            ).subscribe((account) => {
                this.logger.info(`onWebViewMounted(): dispatch "TryToLogin"`);
                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.TryToLogin({account, webView}));
            }),
        );

        this.subscription.add(
            combineLatest(
                this.store.pipe(
                    select(AccountsSelectors.FEATURED.selectedLogin),
                ),
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.mainProcessNotification),
                    startWith(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow()),
                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.ActivateBrowserWindow),
                ),
            ).pipe(
                filter(([selectedLogin]) => this.account.accountConfig.login === selectedLogin),
                debounceTime(ONE_SECOND_MS * 0.3),
            ).subscribe(async () => {
                this.focusWebView(webView);
                await this.sendSelectAccountNotification(webView);
            }),
        );

        this.subscription.add(
            this.account$.pipe(
                map((account) => account.fetchSingleMailParams),
                distinctUntilChanged(),
                withLatestFrom(this.account$),
            ).subscribe(([value, account]) => {
                const {accountConfig: {type, login}} = account;

                if (
                    !value
                    ||
                    value.type !== type
                    ||
                    value.login !== login
                ) {
                    return;
                }

                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.FetchSingleMail({account, webView, mailPk: value.mailPk}));
            }),
        );
    }

    private registerWebViewEvents(webView: Electron.WebviewTag) {
        this.logger.info(`registerWebViewEvents()`);

        const arrayOfDomReadyEvenNameAndHandler: ["dom-ready", (event: Electron.Event) => void] = [
            "dom-ready",
            () => {
                this.logger.verbose(`webview.domReadyEventHandler(): "${webView.src}"`);

                this.resolveOnWebViewDomReadyDeferreds();
                this.domReadySubscription.unsubscribe();
                this.domReadySubscription = new Subscription();

                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.SetupNotificationChannel({
                    account: this.account, webView, finishPromise: this.setupOnWebViewDomReadyDeferred().promise,
                }));

                this.domReadySubscription.add(
                    ((state: { stopSyncingDeferred?: Deferred<void> } = {}) => {
                        return this.account$
                            .pipe(
                                map(({notifications, accountConfig}) => ({
                                    pk: {type: accountConfig.type, login: accountConfig.login},
                                    data: {loggedIn: notifications.loggedIn, database: accountConfig.database},
                                })),
                                distinctUntilChanged((prev, curr) => equals(prev.data, curr.data)),
                            )
                            .subscribe(async ({pk, data}) => {
                                const disabled = !data.loggedIn || !data.database;

                                if (state.stopSyncingDeferred) {
                                    state.stopSyncingDeferred.resolve();
                                }

                                if (disabled) {
                                    return;
                                }

                                state.stopSyncingDeferred = this.setupOnWebViewDomReadyDeferred();

                                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.ToggleSyncing({
                                    pk, webView, finishPromise: state.stopSyncingDeferred.promise,
                                }));
                            });
                    })(),
                );
            },
        ];
        const subscribeDomReadyHandler = () => {
            this.logger.info(`webview.subscribeDomReadyHandler()`);
            webView.addEventListener(...arrayOfDomReadyEvenNameAndHandler);
        };
        const unsubscribeDomReadyHandler = () => {
            this.logger.info(`webview.unsubscribeDomReadyHandler()`);
            webView.removeEventListener(...arrayOfDomReadyEvenNameAndHandler);
        };

        subscribeDomReadyHandler();
        this.subscription.add({unsubscribe: unsubscribeDomReadyHandler});

        webView.addEventListener("new-window", ({url}: any) => {
            this.dispatchInLoggerZone(NAVIGATION_ACTIONS.OpenExternal({url}));
        });

        webView.addEventListener("did-fail-load", ((options: { iteration: number, stepSeconds: number }) => {
            let intervalId: any = null;

            return ({errorDescription}: Electron.DidFailLoadEvent) => {
                this.logger.verbose(`webview:did-fail-load: "${webView.src}"`);

                // TODO figure ERR_NOT_IMPLEMENTED error cause, happening on password/2fa code submitting, tutanota only issue
                if (errorDescription === "ERR_NOT_IMPLEMENTED" && this.account.accountConfig.type === "tutanota") {
                    return;
                }

                this.didFailLoadErrorDescription = errorDescription;

                this.resolveOnWebViewDomReadyDeferreds();
                unsubscribeDomReadyHandler();

                options.iteration++;

                this.afterFailedLoadWait = Math.min(options.stepSeconds * options.iteration, 60);
                this.changeDetectorRef.detectChanges();

                this.webViewState$.next({action: "visibility", visible: false});

                intervalId = setInterval(() => {
                    this.afterFailedLoadWait += -1;
                    this.changeDetectorRef.detectChanges();

                    if (this.afterFailedLoadWait > 0) {
                        return;
                    }

                    this.webViewState$.next({action: "visibility", visible: true});
                    clearInterval(intervalId);
                    subscribeDomReadyHandler();
                    webView.reloadIgnoringCache();
                }, ONE_SECOND_MS);
            };
        })({iteration: 0, stepSeconds: 10}));
    }

    private setupOnWebViewDomReadyDeferred() {
        this.logger.info(`setupOnWebViewDomReadyDeferred()`);
        const deferred = new Deferred<void>();
        this.onWebViewDomReadyDeferreds.push(deferred);
        return deferred;
    }

    private resolveOnWebViewDomReadyDeferreds() {
        this.logger.info(`resolveOnWebViewDomReadyDeferredes()`);
        this.onWebViewDomReadyDeferreds.forEach((deferred) => deferred.resolve());
        // TODO remove executed items form the array
    }

    private dispatchInLoggerZone<A extends Action = Action>(action: A) {
        this.loggerZone.run(() => {
            this.store.dispatch(action);
        });
    }

    private focusWebView(webView: Electron.WebviewTag) {
        const activeElement = document.activeElement as any;

        if (activeElement && typeof activeElement.blur === "function") {
            activeElement.blur();
        }

        webView.blur();
        webView.focus();
    }

    private async sendSelectAccountNotification(webView: Electron.WebviewTag) {
        const webViewClient = await this.api.webViewClient(webView, this.account.accountConfig.type).toPromise();
        await webViewClient("selectAccount")({zoneName: this.loggerZone.name, databaseView: this.account.databaseView});
    }
}
