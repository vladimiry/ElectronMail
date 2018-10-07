import {Action, Store, select} from "@ngrx/store";
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostBinding,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewContainerRef,
} from "@angular/core";
import {Deferred} from "ts-deferred";
// tslint:disable-next-line:no-import-zones
import {DidFailLoadEvent} from "electron";
import {EMPTY, Subscription, combineLatest, of} from "rxjs";
import {debounceTime, distinctUntilChanged, filter, map, mergeMap, pairwise} from "rxjs/operators";
import {equals, pick} from "ramda";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {APP_NAME, ONE_SECOND_MS} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {DbViewModuleResolve} from "./db-view-module-resolve.service";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {State} from "src/web/src/app/store/reducers/accounts";
import {Unpacked} from "src/shared/types";
import {WebAccount} from "src/web/src/app/model";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

let componentIndex = 0;

const pickCredentialFields = ((fields: Array<keyof AccountConfig>) => (ac: AccountConfig) => pick(fields, ac))([
    "credentials",
    "credentialsKeePass",
]);

@Component({
    selector: "email-securely-app-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent extends NgChangesObservableComponent implements OnDestroy, OnInit {
    @Input()
    account!: WebAccount;
    account$ = this.ngChangesObservable("account");
    @HostBinding("class.webview-hidden-database")
    webViewHiddenByDatabaseView: boolean = false;
    webViewAttributes?: { src: string; preload: string; };
    @HostBinding("class.webview-hidden-offline")
    afterFailedLoadWait: number = 0;
    didFailLoadErrorDescription?: string;
    keePassClientConf$ = this.store.pipe(select(OptionsSelectors.SETTINGS.keePassClientConf));
    passwordKeePassRef$ = this.account$.pipe(map(({accountConfig}) => accountConfig.credentialsKeePass.password));
    twoFactorCodeKeePassRef$ = this.account$.pipe(map(({accountConfig}) => accountConfig.credentialsKeePass.twoFactorCode));
    mailPasswordKeePassRef$ = this.account$.pipe(mergeMap(({accountConfig}) => {
        return accountConfig.type === "protonmail" ? of(accountConfig.credentialsKeePass.mailPassword) : EMPTY;
    }));
    private logger: ReturnType<typeof getZoneNameBoundWebLogger>;
    private loggerZone: Zone;
    @ViewChild("webViewRef", {read: ElementRef})
    private webViewElementRef?: ElementRef;
    private webViewDeferred = new Deferred<Electron.WebviewTag>();
    private subscription = new Subscription();
    private domReadySubscription = new Subscription();
    private onWebViewDomReadyDeferreds: Array<Deferred<void>> = [];
    @ViewChild("dbViewContainer", {read: ViewContainerRef})
    private dbViewContainerRef!: ViewContainerRef;

    constructor(
        private dbViewModuleResolve: DbViewModuleResolve,
        private store: Store<State>,
        private zone: NgZone,
        private changeDetectorRef: ChangeDetectorRef,
    ) {
        super();
        const loggerPrefix = `[account.component][${componentIndex++}]`;
        this.loggerZone = Zone.current.fork({name: loggerPrefix});
        this.logger = getZoneNameBoundWebLogger(loggerPrefix);
        this.logger.info(`constructor()`);
    }

    ngOnInit() {
        this.subscription.add(
            this.store.pipe(
                select(OptionsSelectors.CONFIG.unreadNotifications),
                distinctUntilChanged(),
                mergeMap((unreadNotifications) => {
                    return unreadNotifications
                        ? this.account$.pipe(
                            map((a) => ({login: a.accountConfig.login, unread: a.notifications.unread})),
                            pairwise(),
                            filter(([prev, curr]) => curr.unread > prev.unread),
                            map(([prev, curr]) => curr),
                        )
                        : [];
                }),
            ).subscribe(({login, unread}) => {
                const body = `Account "${login}" has ${unread} unread email${unread > 1 ? "s" : ""}.`;
                new Notification(APP_NAME, {body}).onclick = () => this.zone.run(() => {
                    this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.Activate({login}));
                    this.dispatchInLoggerZone(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                });
            }),
        );
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
                    )
                    .subscribe(async ({type, login, databaseView}) => {
                        if (state.dbViewComponentRef) {
                            state.dbViewComponentRef.instance.setVisibility(Boolean(databaseView));
                        } else if (databaseView) {
                            state.dbViewComponentRef = await this.dbViewModuleResolve.buildComponentRef({type, login});
                            this.dbViewContainerRef.insert(state.dbViewComponentRef.hostView);
                        }

                        this.webViewHiddenByDatabaseView = Boolean(databaseView);

                        if (!this.webViewHiddenByDatabaseView) {
                            setTimeout(() => this.focusWebView, 0);
                        }
                    });
            })(),
        );
        this.subscription.add(
            combineLatest(
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.electronLocations),
                    mergeMap((value) => value ? [value.preload.webView] : []),
                ),
                this.account$.pipe(
                    distinctUntilChanged((prev, curr) => prev.accountConfig.entryUrl === curr.accountConfig.entryUrl),
                ),
            ).subscribe(([webViewPreloadsRecord, {accountConfig}]) => {
                const {entryUrl, type} = accountConfig;

                if (this.webViewAttributes) {
                    this.webViewAttributes.src = entryUrl;
                    this.logger.verbose(`webview.attrs (src update): "${entryUrl}"`);
                    this.changeDetectorRef.detectChanges();
                    return;
                }

                this.webViewAttributes = {src: entryUrl, preload: webViewPreloadsRecord[type]};
                this.logger.verbose(`webview.attrs (initialize): "${this.webViewAttributes.src}"`);
                this.changeDetectorRef.detectChanges();
                if (!this.webViewElementRef) {
                    throw new Error(`"this.webViewElementRef" is supposed to be initialized at this stage`);
                }
                this.onWebViewMounted(this.webViewElementRef.nativeElement);
            }),
        );
    }

    ngOnDestroy() {
        this.logger.info(`ngOnDestroy()`);
        this.subscription.unsubscribe();
        this.resolveOnWebViewDomReadyDeferreds();
    }

    onKeePassPassword(password: string) {
        this.logger.info(`onKeePassPassword()`);
        // tslint:disable-next-line:no-floating-promises
        this.webViewDeferred.promise.then((webView) => {
            this.logger.info(`dispatch "TryToLogin" from onKeePassPassword()`);
            this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.TryToLogin({webView, account: this.account, password}));
        });
    }

    private dispatchInLoggerZone<A extends Action = Action>(action: A) {
        this.loggerZone.run(() => {
            this.store.dispatch(action);
        });
    }

    private onWebViewMounted(webView: Electron.WebviewTag) {
        this.logger.info(`onWebViewMounted()`);

        this.webViewDeferred.resolve(webView);

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
                    );
                }),
                map(([prev, curr]) => curr),
            ).subscribe((account) => {
                this.logger.info(`dispatch "TryToLogin"`);
                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.TryToLogin({account, webView}));
            }),
        );

        this.subscription.add(
            combineLatest(
                this.store.pipe(select(AccountsSelectors.FEATURED.selectedLogin)),
                this.store.pipe(select(OptionsSelectors.FEATURED.activateBrowserWindowCounter)),
            ).pipe(
                filter(([selectedLogin]) => this.account.accountConfig.login === selectedLogin),
                debounceTime(300),
            ).subscribe(() => {
                this.focusWebView();
            }),
        );

        if ((process.env.NODE_ENV/* as BuildEnvironment*/) === "development") {
            webView.addEventListener("dom-ready", () => webView.openDevTools());
        }

        this.configureWebView(webView);
    }

    private focusWebView(webView?: Electron.WebviewTag) {
        webView = webView || (this.webViewElementRef && this.webViewElementRef.nativeElement);

        if (!webView) {
            return;
        }

        webView.blur();
        webView.focus();
    }

    private configureWebView(webView: Electron.WebviewTag) {
        this.logger.info(`configureWebView()`);

        const domReadyEventHandler = () => {
            this.logger.verbose(`webview.domReadyEventHandler(): "${webView.src}"`);

            this.resolveOnWebViewDomReadyDeferreds();
            this.domReadySubscription.unsubscribe();
            this.domReadySubscription = new Subscription();

            this.domReadySubscription.add(
                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.SetupNotificationChannel({
                    account: this.account, webView, finishPromise: this.setupOnWebViewDomReadyDeferred().promise,
                })),
            );

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
        };
        const arrayOfDomReadyEvenNameAndHandler = ["dom-ready", domReadyEventHandler];
        const subscribeDomReadyHandler = () => {
            this.logger.info(`webview.subscribeDomReadyHandler()`);
            webView.addEventListener.apply(webView, arrayOfDomReadyEvenNameAndHandler);
        };
        const unsubscribeDomReadyHandler = () => {
            this.logger.info(`webview.unsubscribeDomReadyHandler()`);
            webView.removeEventListener.apply(webView, arrayOfDomReadyEvenNameAndHandler);
        };

        subscribeDomReadyHandler();
        this.subscription.add({unsubscribe: unsubscribeDomReadyHandler});

        webView.addEventListener("new-window", ({url}: any) => {
            this.dispatchInLoggerZone(NAVIGATION_ACTIONS.OpenExternal({url}));
        });

        webView.addEventListener("did-fail-load", ((options: { iteration: number, stepSeconds: number }) => {
            let intervalId: any = null;

            return ({errorDescription}: DidFailLoadEvent) => {
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

                intervalId = setInterval(() => {
                    this.afterFailedLoadWait += -1;
                    this.changeDetectorRef.detectChanges();

                    if (this.afterFailedLoadWait > 0) {
                        return;
                    }

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
}
