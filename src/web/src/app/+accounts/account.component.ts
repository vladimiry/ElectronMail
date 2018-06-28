import {AfterViewInit, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewChild} from "@angular/core";
import {BehaviorSubject, Observable, Subject} from "rxjs";
import {DidFailLoadEvent} from "electron";
import {filter, map, pairwise, takeUntil, withLatestFrom} from "rxjs/operators";
import {Store} from "@ngrx/store";

import {KeePassRef} from "_@shared/model/keepasshttp";
import {WebAccount} from "_@shared/model/account";
import {
    configUnreadNotificationsSelector,
    electronLocationsSelector,
    settingsKeePassClientConfSelector,
    State as OptionsState,
} from "_@web/src/app/store/reducers/options";
import {State} from "_@web/src/app/store/reducers/accounts";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "_@web/src/app/store/actions";

@Component({
    selector: `protonmail-desktop-app-account`,
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
})
export class AccountComponent implements AfterViewInit, OnDestroy {
    // webView initialization
    webViewSrc = "https://mail.protonmail.com/login";
    webViewPreload$ = this.optionsStore.select(electronLocationsSelector)
        .pipe(map((electronLocations) => electronLocations && electronLocations.preload.webView));
    // account
    // TODO simplify account$ initialization and usage
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
                this.pageLoadedReaction(account);
            }
            this.account$.next(account);
        } else {
            this.account$ = new BehaviorSubject(account);
            this.initAccountReactions();
        }
    }

    get webView(): any /* TODO switch to Electron.WebviewTag */ {
        return this.webViewRef.nativeElement;
    }

    initAccountReactions() {
        this.account$
            .pipe(
                map(({sync}) => sync.pageType),
                pairwise(),
                filter(([prevPageType, currentPageType]) => currentPageType && currentPageType !== prevPageType),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(() => this.pageLoadedReaction(this.account$.getValue()));

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

        // unread notifications
        this.account$
            .pipe(
                withLatestFrom(this.optionsStore.select(configUnreadNotificationsSelector)),
                filter((args) => !!args[1]),
                map((args) => args[0].sync.unread || 0),
                pairwise(),
                filter(([prev, curr]) => curr > prev),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(([prev, curr]) => {
                const login = this.account$.getValue().accountConfig.login;
                const title = String(process.env.APP_ENV_PACKAGE_NAME);
                const body = `Account "${login}" has ${curr} unread email${curr > 1 ? "s" : ""}.`;

                new Notification(title, {body}).onclick = () => this.zone.run(() => {
                    this.store.dispatch(ACCOUNTS_ACTIONS.ActivateAccount({login}));
                    this.store.dispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                });
            });
    }

    pageLoadedReaction(account: WebAccount) {
        this.optionsStore.dispatch(ACCOUNTS_ACTIONS.PageLoadingEnd({account, webView: this.webView}));
    }

    isPageLogin() {
        return this.account$.getValue().sync.pageType.type === "login";
    }

    isPageUnlock() {
        return this.account$.getValue().sync.pageType.type === "unlock";
    }

    onPassword(password: string) {
        this.optionsStore.dispatch(
            ACCOUNTS_ACTIONS.Login({pageType: "login", webView: this.webView, account: this.account$.getValue(), password}),
        );
    }

    onMailPassword(mailPassword: string) {
        this.optionsStore.dispatch(
            ACCOUNTS_ACTIONS.Login({pageType: "unlock", webView: this.webView, account: this.account$.getValue(), password: mailPassword}),
        );
    }

    ngAfterViewInit() {
        this.subscribePageLoadingEvents();

        this.webView.addEventListener("new-window", ({url}: any) => {
            this.optionsStore.dispatch(NAVIGATION_ACTIONS.OpenExternal({url}));
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
    }

    unsubscribePageLoadingEvents() {
        this.webView.removeEventListener("dom-ready", this.pageLoadingStartHandler);
    }

    pageLoadingStartHandler = () => {
        this.pageLoadingStartResolve();

        this.optionsStore.dispatch(ACCOUNTS_ACTIONS.PageLoadingStart({
            account: this.account$.getValue(),
            webView: this.webView,
            unSubscribeOn: new Promise((resolve) => this.pageLoadingStartResolve = resolve),
        }));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();

        this.unsubscribePageLoadingEvents();

        this.pageLoadingStartResolve();
    }
}
