import {BehaviorSubject, EMPTY, Observable, of, Subject} from "rxjs";
import {AfterViewInit, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewChild} from "@angular/core";
import {DidFailLoadEvent} from "electron";
import {distinctUntilChanged, filter, map, pairwise, switchMap, takeUntil, withLatestFrom} from "rxjs/operators";
import {equals, omit, pick} from "ramda";
import {Store} from "@ngrx/store";

import {AccountConfig, WebAccount} from "src/shared/model/account";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {APP_NAME, ONE_SECOND_MS} from "src/shared/constants";
import {configUnreadNotificationsSelector, settingsKeePassClientConfSelector} from "src/web/src/app/store/reducers/options";
import {ElectronContextLocations} from "src/shared/model/electron";
import {KeePassRef} from "src/shared/model/keepasshttp";
import {Omit} from "src/shared/types";
import {State} from "src/web/src/app/store/reducers/accounts";

export type WebViewPreloads = ElectronContextLocations["preload"]["webView"];

@Component({
    selector: "email-securely-app-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
})
export class AccountComponent implements AfterViewInit, OnDestroy {
    // TODO simplify account$ initialization and usage
    account$: BehaviorSubject<WebAccount>;
    // keepass
    keePassClientConf$ = this.store.select(settingsKeePassClientConfSelector);
    passwordKeePassRef$: Observable<KeePassRef | undefined>;
    twoFactorCodeKeePassRef$: Observable<KeePassRef | undefined>;
    mailPasswordKeePassRef$: Observable<KeePassRef | undefined>;
    // webview
    @ViewChild("webViewRef", {read: ElementRef})
    webViewRef: ElementRef;
    webViewOptions: { src: string; preload: string; };
    webViewPreloads: Omit<WebViewPreloads, "stub">;
    webViewDomReadyHandlerArgs: ["dom-ready", typeof AccountComponent.prototype.webViewDomReadyEventHandler];
    webViewSrcSetupPromiseTrigger: () => void;
    webViewSrcSetupPromise = new Promise((resolve) => this.webViewSrcSetupPromiseTrigger = resolve);
    // offline
    offlineIntervalStepSec = 10;
    offlineIntervalAttempt = 0;
    offlineIntervalHandle: any;
    didFailLoadErrorDescription: string;
    @HostBinding("class.web-view-hidden")
    offlineIntervalRemainingSec: number;
    // other
    credentialsFields: Array<keyof AccountConfig> = ["credentials", "credentialsKeePass"];
    // releasing
    unSubscribe$ = new Subject();
    releasingResolvers: Array<() => void> = [];

    constructor(private store: Store<State>,
                private zone: NgZone) {
        this.webViewDomReadyHandlerArgs = ["dom-ready", this.webViewDomReadyEventHandler.bind(this)];
    }

    @Input()
    set config(allWebViewPreloads: WebViewPreloads) {
        if (!this.webViewOptions) {
            this.webViewOptions = {src: "about:blank", preload: allWebViewPreloads.stub};
        }
        this.webViewPreloads = omit([((name: keyof Pick<WebViewPreloads, "stub">) => name)("stub")], allWebViewPreloads);
    }

    @Input()
    set account(account: WebAccount) {
        if (this.account$) {
            const prevCredentials = pick(this.credentialsFields, this.account$.getValue().accountConfig);
            const newCredentials = pick(this.credentialsFields, account.accountConfig);

            if (!equals(prevCredentials, newCredentials) && this.webView) {
                this.store.dispatch(ACCOUNTS_ACTIONS.TryToLogin({account, webView: this.webView}));
            }

            this.account$.next(account);
        } else {
            this.account$ = new BehaviorSubject(account);
            this.initAccountChangeReactions();
        }
    }

    get webView(): Electron.WebviewTag {
        return this.webViewRef.nativeElement;
    }

    initAccountChangeReactions() {
        this.account$
            .pipe(
                map(({accountConfig}) => accountConfig),
                distinctUntilChanged(({entryUrl: prev}, {entryUrl: curr}) => prev === curr),
                takeUntil(this.unSubscribe$),
            )
            .subscribe((accountConfig) => {
                this.webViewOptions = {
                    src: accountConfig.entryUrl,
                    preload: this.webViewPreloads[accountConfig.type],
                };
                this.webViewSrcSetupPromiseTrigger();
            });

        this.account$
            .pipe(
                map(({notifications}) => notifications.pageType && notifications.pageType.type),
                filter((pageType) => pageType !== "undefined"),
                distinctUntilChanged(),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(() => {
                this.store.dispatch(ACCOUNTS_ACTIONS.TryToLogin({account: this.account$.getValue(), webView: this.webView}));
            });

        this.account$
            .pipe(
                map(({notifications, accountConfig}) => ({loggedIn: notifications.loggedIn, storeMails: accountConfig.storeMails})),
                distinctUntilChanged((prev, curr) => equals(prev, curr)), // TODO => "distinctUntilChanged(equals)"
                takeUntil(this.unSubscribe$),
            )
            .subscribe(({loggedIn, storeMails}) => {
                const account = this.account$.getValue();
                const login = account.accountConfig.login;

                if (loggedIn && storeMails) {
                    this.store.dispatch(ACCOUNTS_ACTIONS.ToggleFetching({
                        account,
                        webView: this.webView,
                        finishPromise: this.buildReleasingPromise(),
                    }));
                } else {
                    this.store.dispatch(ACCOUNTS_ACTIONS.ToggleFetching({login}));
                }
            });

        this.account$
            .pipe(
                withLatestFrom(this.store.select(configUnreadNotificationsSelector)),
                filter(([account, unreadNotificationsEnabled]) => Boolean(unreadNotificationsEnabled)),
                map(([{notifications}]) => notifications.unread),
                pairwise(),
                filter(([previousUnread, currentUnread]) => currentUnread > previousUnread),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(([previousUnread, currentUnread]) => {
                const login = this.account$.getValue().accountConfig.login;
                const body = `Account "${login}" has ${currentUnread} unread email${currentUnread > 1 ? "s" : ""}.`;

                new Notification(APP_NAME, {body}).onclick = () => this.zone.run(() => {
                    this.store.dispatch(ACCOUNTS_ACTIONS.Activate({login}));
                    this.store.dispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                });
            });

        this.passwordKeePassRef$ = this.account$.pipe(map(({accountConfig}) => {
            return accountConfig.credentialsKeePass.password;
        }));
        this.twoFactorCodeKeePassRef$ = this.account$.pipe(map(({accountConfig}) => {
            return accountConfig.credentialsKeePass.twoFactorCode;
        }));
        this.mailPasswordKeePassRef$ = this.account$.pipe(switchMap(({accountConfig}) => {
            return accountConfig.type === "protonmail" ? of(accountConfig.credentialsKeePass.mailPassword) : EMPTY;
        }));
    }

    buildReleasingPromise() {
        // tslint:disable-next-line:no-unused-expression
        return new Promise((resolve) => {
            this.releasingResolvers.push(resolve);
        });
    }

    triggerReleasingResolvers() {
        this.releasingResolvers.forEach((resolver) => resolver());
    }

    onKeePassPassword(password: string) {
        this.store.dispatch(ACCOUNTS_ACTIONS.TryToLogin({webView: this.webView, account: this.account$.getValue(), password}));
    }

    async ngAfterViewInit() {
        await this.webViewSrcSetupPromise;

        if ((process.env.NODE_ENV/* as BuildEnvironment*/) === "development") {
            this.webView.addEventListener("dom-ready", () => this.webView.openDevTools());
        }

        this.subscribePageLoadedEvents();

        this.webView.addEventListener("new-window", ({url}: any) => {
            this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({url}));
        });

        this.webView.addEventListener("did-fail-load", ({errorDescription}: DidFailLoadEvent) => {
            // TODO figure ERR_NOT_IMPLEMENTED error cause, happening on password/2fa code submitting, tutanota only issue
            if (errorDescription === "ERR_NOT_IMPLEMENTED" && this.account$.getValue().accountConfig.type === "tutanota") {
                return;
            }

            this.didFailLoadErrorDescription = errorDescription;

            this.unsubscribePageLoadingEvents();
            this.triggerReleasingResolvers();

            this.offlineIntervalAttempt++;
            this.offlineIntervalRemainingSec = Math.min(this.offlineIntervalStepSec * this.offlineIntervalAttempt, 60);
            this.offlineIntervalHandle = setInterval(() => {
                this.offlineIntervalRemainingSec--;
                if (!this.offlineIntervalRemainingSec) {
                    clearInterval(this.offlineIntervalHandle);
                    this.subscribePageLoadedEvents();
                    this.webView.reloadIgnoringCache();
                }
            }, ONE_SECOND_MS);
        });
    }

    subscribePageLoadedEvents() {
        this.webView.addEventListener.apply(this.webView, this.webViewDomReadyHandlerArgs);
    }

    unsubscribePageLoadingEvents() {
        this.webView.removeEventListener.apply(this.webView, this.webViewDomReadyHandlerArgs);
    }

    webViewDomReadyEventHandler() {
        this.triggerReleasingResolvers();

        this.store.dispatch(ACCOUNTS_ACTIONS.SetupNotificationChannel({
            account: this.account$.getValue(),
            webView: this.webView,
            finishPromise: this.buildReleasingPromise(),
        }));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();

        this.unsubscribePageLoadingEvents();
        this.triggerReleasingResolvers();
    }
}
