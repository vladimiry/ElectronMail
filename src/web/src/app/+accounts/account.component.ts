import {AfterViewInit, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewChild} from "@angular/core";
import {BehaviorSubject, EMPTY, Observable, of, Subject} from "rxjs";
import {DidFailLoadEvent} from "electron";
import {distinctUntilChanged, filter, map, pairwise, switchMap, takeUntil, withLatestFrom} from "rxjs/operators";
import {Store} from "@ngrx/store";

import {
    configUnreadNotificationsSelector,
    electronLocationsSelector,
    settingsKeePassClientConfSelector,
    State as OptionsState,
} from "_@web/src/app/store/reducers/options";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "_@web/src/app/store/actions";
import {KeePassRef} from "_@shared/model/keepasshttp";
import {State} from "_@web/src/app/store/reducers/accounts";
import {WebAccount} from "_@shared/model/account";

@Component({
    selector: `protonmail-desktop-app-account`,
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
})
export class AccountComponent implements AfterViewInit, OnDestroy {
    // webView initialization
    webViewOptions: { src: string; preload: string; };
    // account
    // TODO simplify account$ initialization and usage
    account$: BehaviorSubject<WebAccount>;
    // keepass
    keePassClientConf$ = this.optionsStore.select(settingsKeePassClientConfSelector);
    passwordKeePassRef$: Observable<KeePassRef | undefined>;
    twoFactorCodeKeePassRef$: Observable<KeePassRef | undefined>;
    mailPasswordKeePassRef$: Observable<KeePassRef | undefined>;
    // offline interval
    offlineIntervalStepSec = 10;
    offlineIntervalAttempt = 0;
    offlineIntervalHandle: any;
    didFailLoadErrorDescription: string;
    @HostBinding("class.web-view-hidden")
    offlineIntervalRemainingSec: number;
    // other
    @ViewChild("webViewRef", {read: ElementRef})
    webViewRef: ElementRef;
    notificationsCleanupTrigger: () => void;
    unSubscribe$ = new Subject();

    constructor(private store: Store<State>,
                private optionsStore: Store<OptionsState>,
                private zone: NgZone) {
        this.notificationsCleanupTrigger = () => {};
    }

    @Input()
    set account(account: WebAccount) {
        if (this.account$) {
            if (JSON.stringify(account.accountConfig) !== JSON.stringify(this.account$.getValue().accountConfig)) {
                this.pageOrCconfigChangeReaction(account);
            }
            this.account$.next(account);
        } else {
            this.account$ = new BehaviorSubject(account);
            this.initAccountReactions();
        }
    }

    get webView(): Electron.WebviewTag {
        return this.webViewRef.nativeElement;
    }

    initAccountReactions() {
        this.account$
            .pipe(
                map(({notifications}) => notifications.pageType && notifications.pageType.type),
                pairwise(),
                filter(([prevPageType, currentPageType]) => currentPageType !== prevPageType),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(() => this.pageOrCconfigChangeReaction(this.account$.getValue()));

        this.account$
            .pipe(
                withLatestFrom(this.optionsStore.select(configUnreadNotificationsSelector)),
                filter(([account, notificationEnabled]) => !!notificationEnabled),
                map(([{notifications}]) => notifications.unread),
                pairwise(),
                filter(([previousUnread, currentUnread]) => currentUnread > previousUnread),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(([previousUnread, currentUnread]) => {
                const login = this.account$.getValue().accountConfig.login;
                const title = String(process.env.APP_ENV_PACKAGE_NAME);
                const body = `Account "${login}" has ${currentUnread} unread email${currentUnread > 1 ? "s" : ""}.`;

                new Notification(title, {body}).onclick = () => this.zone.run(() => {
                    this.store.dispatch(ACCOUNTS_ACTIONS.Activate({login}));
                    this.store.dispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                });
            });

        this.account$
            .pipe(
                withLatestFrom(this.optionsStore.select(electronLocationsSelector)),
                distinctUntilChanged(([{accountConfig: prev}], [{accountConfig: curr}]) => prev.entryUrl === curr.entryUrl),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(([{accountConfig}, electronLocations]) => {
                if (!electronLocations) {
                    return;
                }

                this.webViewOptions = {
                    src: accountConfig.entryUrl,
                    preload: electronLocations.preload.webView[accountConfig.type],
                };
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

    pageOrCconfigChangeReaction(account: WebAccount) {
        this.optionsStore.dispatch(ACCOUNTS_ACTIONS.Login({account, webView: this.webView}));
    }

    onKeePassPassword(password: string) {
        this.optionsStore.dispatch(
            ACCOUNTS_ACTIONS.Login({webView: this.webView, account: this.account$.getValue(), password}),
        );
    }

    ngAfterViewInit() {
        // if ((process.env.NODE_ENV as BuildEnvironment) === "development") {
        //     this.webView.addEventListener("dom-ready", () => this.webView.openDevTools());
        // }

        this.subscribePageLoadingEvents();

        this.webView.addEventListener("new-window", ({url}: any) => {
            this.optionsStore.dispatch(NAVIGATION_ACTIONS.OpenExternal({url}));
        });
        this.webView.addEventListener("did-fail-load", ({errorDescription}: DidFailLoadEvent) => {
            // TODO figure ERR_NOT_IMPLEMENTED error cause, happening on password/2fa code submitting, tutanota only
            if (errorDescription === "ERR_NOT_IMPLEMENTED" && this.account$.getValue().accountConfig.type === "tutanota") {
                return;
            }

            this.unsubscribePageLoadingEvents();
            this.notificationsCleanupTrigger();
            this.didFailLoadErrorDescription = errorDescription;

            this.offlineIntervalAttempt++;
            this.offlineIntervalRemainingSec = Math.min(this.offlineIntervalStepSec * this.offlineIntervalAttempt, 60);
            this.offlineIntervalHandle = setInterval(() => {
                this.offlineIntervalRemainingSec--;

                if (!this.offlineIntervalRemainingSec) {
                    clearInterval(this.offlineIntervalHandle);
                    this.subscribePageLoadingEvents();
                    this.webView.reloadIgnoringCache();
                }
            }, 1000);
        });
    }

    subscribePageLoadingEvents() {
        this.webView.addEventListener("dom-ready", this.pageLoadingStartHandler);
    }

    unsubscribePageLoadingEvents() {
        this.webView.removeEventListener("dom-ready", this.pageLoadingStartHandler);
    }

    pageLoadingStartHandler = () => {
        this.notificationsCleanupTrigger();

        this.optionsStore.dispatch(ACCOUNTS_ACTIONS.SetupNotifications({
            account: this.account$.getValue(),
            webView: this.webView,
            unSubscribeOn: new Promise((resolve) => this.notificationsCleanupTrigger = resolve),
        }));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();

        this.unsubscribePageLoadingEvents();

        this.notificationsCleanupTrigger();
    }
}
