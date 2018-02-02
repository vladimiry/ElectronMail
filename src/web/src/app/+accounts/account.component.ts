import {AfterViewInit, Component, HostBinding, Input, NgZone, OnDestroy, ViewChild, ElementRef} from "@angular/core";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {DidFailLoadEvent} from "electron";
import {filter, map, pairwise, takeUntil, withLatestFrom} from "rxjs/operators";
import {Observable} from "rxjs/Observable";
import {Store} from "@ngrx/store";
import {Subject} from "rxjs/Subject";

import {KeePassRef} from "_shared/model/keepasshttp";
import {WebAccount, WebAccountPageUrl} from "_shared/model/account";
import {
    configUnreadNotificationsSelector,
    electronLocationsSelector,
    settingsKeePassClientConfSelector,
    State as OptionsState,
} from "_web_app/store/reducers/options";
import {State} from "_web_app/store/reducers/accounts";
import {AccountsActions, NavigationActions} from "_web_app/store/actions";

@Component({
    selector: `protonmail-desktop-app-account`,
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
})
export class AccountComponent implements AfterViewInit, OnDestroy {
    // webView initialization
    webViewSrc = WebAccountPageUrl.Login;
    webViewPreload$ = this.optionsStore.select(electronLocationsSelector)
        .pipe(map((electronLocations) => electronLocations && electronLocations.preload.account));
    // account
    account$: BehaviorSubject<WebAccount>;
    // progress
    passwordProgress$: Observable<boolean>;
    mailPasswordProgress$: Observable<boolean>;
    // keepass
    keePassClientConf$ = this.optionsStore.select(settingsKeePassClientConfSelector);
    passwordKeePassRef$: Observable<KeePassRef | undefined>;
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
    pageLoadingStartResolve: () => void;
    unreadNotifications$ = this.optionsStore.select(configUnreadNotificationsSelector);
    unSubscribe$ = new Subject();

    constructor(private store: Store<State>,
                private optionsStore: Store<OptionsState>,
                private zone: NgZone) {
        this.pageLoadingStartResolve = () => {};
    }

    @Input()
    set account(account: WebAccount) {
        if (this.account$) {
            if (JSON.stringify(account.accountConfig) !== JSON.stringify(this.account$.getValue().accountConfig)) {
                this.dispatchPageLoadingEndAction(account);
            }

            this.account$.next(account);
        } else {
            this.account$ = new BehaviorSubject(account);

            // keepass - password
            this.passwordKeePassRef$ = this.account$.pipe(map(({accountConfig}) =>
                accountConfig.credentials.password.keePassRef,
            ));
            this.passwordProgress$ = this.account$.pipe(map(({progress}) => !!progress.password));

            // keepass - mail password
            this.mailPasswordKeePassRef$ = this.account$.pipe(map(({accountConfig}) =>
                accountConfig.credentials.mailPassword.keePassRef,
            ));
            this.mailPasswordProgress$ = this.account$.pipe(map(({progress}) => !!progress.mailPassword));

            // notifications
            this.account$
                .pipe(
                    withLatestFrom(this.unreadNotifications$),
                    filter((args) => !!args[1]),
                    map((args) => args[0].sync.unread || 0),
                    pairwise(),
                    filter(([prev, curr]) => curr > prev),
                    takeUntil(this.unSubscribe$),
                )
                .subscribe(([prev, curr]) => {
                    const login = this.account$.getValue().accountConfig.login;
                    const title = APP_CONSTANTS.appName;
                    const body = `Account "${login}" has ${curr} unread email${curr > 1 ? "s" : ""}.`;

                    new Notification(title, {body}).onclick = () => this.zone.run(() => {
                        this.store.dispatch(new AccountsActions.ActivateAccount(login));
                        this.store.dispatch(new NavigationActions.ToggleBrowserWindow({forcedState: true}));
                    });
                });
        }
    }

    get webView(): any /* TODO switch to Electron.WebviewTag */ {
        return this.webViewRef.nativeElement;
    }

    get pageUrl(): WebAccountPageUrl {
        const url = this.webView.getAttribute("src") as string;

        // TODO simplify url => WebAccountPageUrl mapping
        switch (url) {
            case WebAccountPageUrl.Login: {
                return WebAccountPageUrl.Login;
            }
            case WebAccountPageUrl.Unlock: {
                return WebAccountPageUrl.Unlock;
            }
        }

        return WebAccountPageUrl.Undefined;
    }

    isPageUrLogin() {
        return WebAccountPageUrl.Login === this.account$.getValue().pageUrl;
    }

    isPageUrlUnlock() {
        return WebAccountPageUrl.Unlock === this.account$.getValue().pageUrl;
    }

    onPassword(password: string) {
        this.optionsStore.dispatch(
            new AccountsActions.Login(WebAccountPageUrl.Login, this.webView, this.account$.getValue(), password),
        );
    }

    onMailPassword(mailPassword: string) {
        this.optionsStore.dispatch(
            new AccountsActions.Login(WebAccountPageUrl.Unlock, this.webView, this.account$.getValue(), mailPassword),
        );
    }

    ngAfterViewInit() {
        this.subscribePageLoadingEvents();

        // this.webView.addEventListener("dom-ready", () => this.webView.openDevTools());
        this.webView.addEventListener("new-window", ({url}: any) => {
            this.optionsStore.dispatch(new NavigationActions.OpenExternal(url));
        });
        this.webView.addEventListener("did-fail-load", ({errorDescription}: DidFailLoadEvent) => {
            this.unsubscribePageLoadingEvents();
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
        this.webView.addEventListener("did-stop-loading", this.pageLoadingEndHandler);
    }

    unsubscribePageLoadingEvents() {
        this.webView.removeEventListener("dom-ready", this.pageLoadingStartHandler);
        this.webView.removeEventListener("did-stop-loading", this.pageLoadingEndHandler);
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();

        this.unsubscribePageLoadingEvents();

        this.pageLoadingStartResolve();
    }

    pageLoadingStartHandler = () => {
        this.dispatchPageLoadingStartAction(this.account$.getValue());
    }

    pageLoadingEndHandler = () => {
        this.dispatchPageLoadingEndAction(this.account$.getValue());
    }

    dispatchPageLoadingEndAction(account: WebAccount) {
        const patch = {webView: this.webView, pageUrl: this.pageUrl};

        this.optionsStore.dispatch(new AccountsActions.PageLoadingEnd(
            account,
            patch,
        ));
    }

    dispatchPageLoadingStartAction(account: WebAccount) {
        const patch = {webView: this.webView, pageUrl: this.pageUrl};

        this.pageLoadingStartResolve();

        this.optionsStore.dispatch(new AccountsActions.PageLoadingStart(
            account,
            patch,
            new Promise((resolve) => this.pageLoadingStartResolve = resolve),
        ));
    }
}
