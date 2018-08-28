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
} from "@angular/core";
import {Deferred} from "ts-deferred";
// tslint:disable-next-line:no-import-zones
import {DidFailLoadEvent} from "electron";
import {EMPTY, Subscription, combineLatest, merge, of} from "rxjs";
import {debounceTime, filter, map, mergeMap, pairwise, take, withLatestFrom} from "rxjs/operators";
import {equals, pick} from "ramda";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {APP_NAME, ONE_SECOND_MS} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/accounts";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

let componentIndex = 0;

@Component({
    selector: "email-securely-app-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent implements OnDestroy, OnInit {
    webViewAttributes?: { src: string; preload: string; };
    didFailLoadErrorDescription?: string;
    @HostBinding("class.web-view-hidden")
    afterFailedLoadWait: number = 0;
    keePassClientConf$ = this.store.select(OptionsSelectors.SETTINGS.keePassClientConf);
    @Input()
    login?: string;
    account$ = this.store.pipe(
        filter(() => !!this.login),
        mergeMap(() => this.store.pipe(select(AccountsSelectors.ACCOUNTS.pickAccount({login: String(this.login)})))),
        mergeMap((account) => account ? [account] : []),
    );
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
    private stopFetchingDeferred?: Deferred<void>;

    constructor(
        private store: Store<State>,
        private zone: NgZone,
        private changeDetectorRef: ChangeDetectorRef,
    ) {
        const loggerPrefix = `[account.component][${componentIndex++}]`;
        this.loggerZone = Zone.current.fork({name: loggerPrefix});
        this.logger = getZoneNameBoundWebLogger(loggerPrefix);
        this.logger.info(`constructor()`);
    }

    ngOnInit() {
        if (!this.login) {
            throw new Error(`"login" @Input is supposed to be initialized at this stage`);
        }

        this.account$.pipe(take(1)).subscribe(() => this.onAccountWiredUp());
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
            this.account$.pipe(take(1)).subscribe((account) => {
                this.logger.info(`dispatch "TryToLogin" from onKeePassPassword()`);
                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.TryToLogin({webView, account, password}));
            });
        });
    }

    private dispatchInLoggerZone<A extends Action = Action>(action: A) {
        this.loggerZone.run(() => {
            this.store.dispatch(action);
        });
    }

    private onAccountWiredUp() {
        this.logger.info(`onAccountWiredUp()`);

        this.subscription.add(
            this.store.select(OptionsSelectors.FEATURED.electronLocations)
                .pipe(
                    mergeMap((value) => value ? [value] : []),
                    map(({preload}) => preload.webView),
                    withLatestFrom(this.account$),
                    take(1),
                )
                .subscribe(([webViewPreloads, {accountConfig}]) => {
                    this.webViewAttributes = {src: accountConfig.entryUrl, preload: webViewPreloads[accountConfig.type]};
                    this.logger.verbose(`webview.attrs.initial: "${this.webViewAttributes.src}"`);

                    this.changeDetectorRef.detectChanges();
                    this.logger.info(`webview.detectChanges: mounted to DOM)`);

                    if (!this.webViewElementRef) {
                        throw new Error(`"this.webViewElementRef" is supposed to be initialized at this stage`);
                    }

                    this.onWebViewMounted(this.webViewElementRef.nativeElement);
                }),
        );
    }

    private onWebViewMounted(webView: Electron.WebviewTag) {
        this.logger.info(`onWebViewMounted()`);

        this.webViewDeferred.resolve(webView);

        this.subscription.add(
            this.account$
                .pipe(
                    map(({accountConfig}) => accountConfig),
                    pairwise(),
                    filter(([{entryUrl: entryUrlPrev}, {entryUrl: entryUrlCurr}]) => entryUrlPrev !== entryUrlCurr),
                    map(([prev, curr]) => curr),
                )
                .subscribe(({entryUrl}) => {
                    if (!this.webViewAttributes) {
                        throw new Error(`"this.webViewAttributes" is supposed to be initialized at this stage`);
                    }

                    this.webViewAttributes.src = entryUrl;
                    this.logger.verbose(`webview.attrs.urlUpdate: "${entryUrl}"`);

                    this.changeDetectorRef.detectChanges();
                    this.logger.info(`webview.detectChanges: updated in DOM`);
                }),
        );
        this.subscription.add(
            merge(
                this.account$.pipe(
                    pairwise(),
                    filter(([{notifications: notificationsPrev}, {notifications: notificationsCurr}]) => {
                        const {pageType: pageTypePrev} = notificationsPrev;
                        const {pageType: pageTypeCurr} = notificationsCurr;
                        // "entryUrl" is changeable, so need to react on "url" change too
                        return pageTypeCurr.type !== "unknown" && !equals(pageTypePrev, pageTypeCurr);
                    }),
                    map(([accountPrev, accountCurr]) => accountCurr),
                ),
                this.account$.pipe(
                    pairwise(),
                    filter(([{accountConfig: accountConfigPrev}, {accountConfig: accountConfigCurr}]) => {
                        // TODO init "fields" once on the upper level
                        const fields: Array<keyof AccountConfig> = ["credentials", "credentialsKeePass"];
                        const prevFields = pick(fields, accountConfigPrev);
                        const currFields = pick(fields, accountConfigCurr);
                        return !equals(prevFields, currFields);
                    }),
                    map(([accountPrev, accountCurr]) => accountCurr),
                ),
            ).subscribe((account) => {
                this.logger.info(`dispatch "TryToLogin"`);
                this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.TryToLogin({account, webView}));
            }),
        );
        this.subscription.add(
            this.account$
                .pipe(
                    withLatestFrom(this.store.select(OptionsSelectors.CONFIG.unreadNotifications)),
                    filter(([account, unreadNotificationsEnabled]) => Boolean(unreadNotificationsEnabled)),
                    map(([account]) => account),
                    pairwise(),
                    filter(([{notifications: prev}, {notifications: curr}]) => curr.unread > prev.unread),
                    map(([prev, curr]) => curr),
                )
                .subscribe(({accountConfig, notifications}) => {
                    const {login} = accountConfig;
                    const {unread} = notifications;
                    const body = `Account "${login}" has ${unread} unread email${unread > 1 ? "s" : ""}.`;
                    new Notification(APP_NAME, {body}).onclick = () => this.zone.run(() => {
                        this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.Activate({login}));
                        this.dispatchInLoggerZone(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                    });
                }),
        );
        this.subscription.add(
            combineLatest(
                this.store.pipe(select(AccountsSelectors.FEATURED.selectedLogin)),
                this.store.pipe(select(OptionsSelectors.FEATURED.activateBrowserWindowCounter)),
            ).pipe(
                filter(([selectedLogin]) => this.login === selectedLogin),
                debounceTime(300),
            ).subscribe((value) => {
                webView.blur();
                webView.focus();
            }),
        );

        // if ((process.env.NODE_ENV/* as BuildEnvironment*/) === "development") {
        //     webView.addEventListener("dom-ready", () => webView.openDevTools());
        // }

        this.configureWebView(webView);
    }

    private configureWebView(webView: Electron.WebviewTag) {
        this.logger.info(`configureWebView()`);

        const domReadyEventHandler = () => {
            this.logger.verbose(`webview.domReadyEventHandler(): "${webView.src}"`);

            this.resolveOnWebViewDomReadyDeferreds();
            this.domReadySubscription.unsubscribe();
            this.domReadySubscription = new Subscription();

            this.domReadySubscription.add(
                this.account$.pipe(take(1)).subscribe((account) => {
                    this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.SetupNotificationChannel({
                        account, webView, finishPromise: this.setupOnWebViewDomReadyDeferred().promise,
                    }));
                }),
            );

            this.domReadySubscription.add(
                this.account$
                    .pipe(
                        map(({notifications, accountConfig}) => ({loggedIn: notifications.loggedIn, storeMails: accountConfig.storeMails})),
                        pairwise(),
                        filter(([prev, curr]) => !equals(prev, curr)),
                        map(([prev, curr]) => curr),
                        withLatestFrom(this.account$),
                    )
                    .subscribe(([{loggedIn, storeMails}, account]) => {
                        if (this.stopFetchingDeferred) {
                            this.stopFetchingDeferred.resolve();
                        }

                        if (!loggedIn || !storeMails) {
                            return;
                        }

                        this.stopFetchingDeferred = this.setupOnWebViewDomReadyDeferred();

                        this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.ToggleFetching({
                            account, webView, finishPromise: this.stopFetchingDeferred.promise,
                        }));
                    }),
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

        this.account$.pipe(take(1)).subscribe(({accountConfig}) => {
            webView.addEventListener("did-fail-load", ((options: { iteration: number, stepSeconds: number }) => {
                let intervalId: any = null;

                return ({errorDescription}: DidFailLoadEvent) => {
                    this.logger.verbose(`webview:did-fail-load: "${webView.src}"`);

                    // TODO figure ERR_NOT_IMPLEMENTED error cause, happening on password/2fa code submitting, tutanota only issue
                    if (errorDescription === "ERR_NOT_IMPLEMENTED" && accountConfig.type === "tutanota") {
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
        });
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
