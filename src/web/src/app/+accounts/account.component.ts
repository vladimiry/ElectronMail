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
import {BehaviorSubject, EMPTY, merge, Observable, of, Subscription} from "rxjs";
// tslint:disable-next-line:no-import-zones
import {DidFailLoadEvent} from "electron";
import {filter, map, mergeMap, pairwise, take, withLatestFrom} from "rxjs/operators";
import {equals, pick} from "ramda";
import {Action, Store} from "@ngrx/store";

import {AccountConfig, WebAccount} from "src/shared/model/account";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {APP_NAME, ONE_SECOND_MS} from "src/shared/constants";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {getZoneNameBoundWebLogger} from "src/web/src/util";
import {KeePassRef} from "src/shared/model/keepasshttp";
import {AccountsSelectors, OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/accounts";

let componentIndex = 0;

@Component({
    selector: "email-securely-app-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent implements OnDestroy, OnInit {
    passwordKeePassRef$: Observable<KeePassRef | undefined>;
    twoFactorCodeKeePassRef$: Observable<KeePassRef | undefined>;
    mailPasswordKeePassRef$: Observable<KeePassRef | undefined>;
    webViewAttributes: { src: string; preload: string; };
    didFailLoadErrorDescription: string;
    @HostBinding("class.web-view-hidden")
    afterFailedLoadWait: number;
    keePassClientConf$ = this.store.select(OptionsSelectors.SETTINGS.keePassClientConf);
    @Input()
    login: string;
    private account$: BehaviorSubject<WebAccount>;
    private logger: ReturnType<typeof getZoneNameBoundWebLogger>;
    private loggerZone: Zone;
    @ViewChild("webViewRef", {read: ElementRef})
    private webViewElementRef: ElementRef;
    private webViewPromiseTrigger: (webView: Electron.WebviewTag) => void;
    private webViewPromise = new Promise<Electron.WebviewTag>((resolve) => this.webViewPromiseTrigger = resolve);
    private subscription = new Subscription();
    private notificationChannelsReleasingTriggers: Array<() => void> = [];

    constructor(
        private electron: ElectronService,
        private store: Store<State>,
        private zone: NgZone,
        private changeDetectorRef: ChangeDetectorRef,
    ) {
        const loggerPrefix = `[account.component][${componentIndex++}]`;
        this.loggerZone = Zone.current.fork({name: loggerPrefix});
        this.logger = getZoneNameBoundWebLogger(loggerPrefix);
        this.logger.info(`constructor()`);
    }

    get account(): WebAccount | null {
        return this.account$ ? this.account$.value : null;
    }

    ngOnInit() {
        const login = this.login;

        if (!login) {
            throw new Error(`"login" argument must be defined at this stage`);
        }

        this.subscription.add(
            this.store
                .select(AccountsSelectors.ACCOUNTS.pickAccount({login}))
                .subscribe((account) => {
                    if (!account) {
                        return;
                    }
                    if (!this.account$) {
                        this.account$ = new BehaviorSubject(account);
                        this.onAccountWiredUp();
                        return;
                    }
                    this.account$.next(account);
                }),
        );
    }

    ngOnDestroy() {
        this.logger.info(`ngOnDestroy()`);
        this.subscription.unsubscribe();
        this.releaseNotificationChannels();
    }

    onKeePassPassword(password: string) {
        this.logger.info(`onKeePassPassword()`);
        // tslint:disable-next-line:no-floating-promises
        this.webViewPromise.then((webView) => {
            this.logger.info(`dispatch "TryToLogin" from onKeePassPassword()`);
            this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.TryToLogin({webView, account: this.account$.value, password}));
        });
    }

    private dispatchInLoggerZone<A extends Action = Action>(action: A) {
        this.loggerZone.run(() => {
            this.store.dispatch(action);
        });
    }

    private onAccountWiredUp() {
        this.logger.info(`onAccountWiredUp()`);

        this.passwordKeePassRef$ = this.account$.pipe(map((a) => a.accountConfig.credentialsKeePass.password));
        this.twoFactorCodeKeePassRef$ = this.account$.pipe(map((a) => a.accountConfig.credentialsKeePass.twoFactorCode));
        this.mailPasswordKeePassRef$ = this.account$.pipe(mergeMap(({accountConfig}) => {
            return accountConfig.type === "protonmail" ? of(accountConfig.credentialsKeePass.mailPassword) : EMPTY;
        }));

        // TODO "take(1)" is sufficient subscription releasing strategy in this case
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
                    this.onWebViewMounted(this.webViewElementRef.nativeElement);
                }),
        );
    }

    private onWebViewMounted(webView: Electron.WebviewTag) {
        this.logger.info(`onWebViewMounted()`);

        this.webViewPromiseTrigger(webView);

        this.subscription.add(
            this.account$
                .pipe(
                    map(({accountConfig}) => accountConfig),
                    pairwise(),
                    filter(([{entryUrl: entryUrlPrev}, {entryUrl: entryUrlCurr}]) => entryUrlPrev !== entryUrlCurr),
                    map(([prev, curr]) => curr),
                )
                .subscribe(({entryUrl}) => {
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
                    map(({notifications, accountConfig}) => ({loggedIn: notifications.loggedIn, storeMails: accountConfig.storeMails})),
                    pairwise(),
                    filter(([prev, curr]) => !equals(prev, curr)),
                    map(([prev, curr]) => curr),
                    withLatestFrom(this.account$),
                )
                .subscribe(([{loggedIn, storeMails}, account]) => {
                    const login = account.accountConfig.login;
                    // TODO wire "ToggleFetching" back after the "triggerPromisesReleasing()" call
                    if (loggedIn && storeMails) {
                        this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.ToggleFetching({
                            account,
                            webView,
                            finishPromise: this.setupNotificationChannelReleasingTrigger(),
                        }));
                        return;
                    }
                    this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.ToggleFetching({login}));
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

        // if ((process.env.NODE_ENV/* as BuildEnvironment*/) === "development") {
        //     this.webView.addEventListener("dom-ready", () => webView.openDevTools());
        // }

        this.configureWebView(webView);
    }

    private configureWebView(webView: Electron.WebviewTag) {
        this.logger.info(`configureWebView()`);

        const domReadyEventHandler = () => {
            this.logger.verbose(`webview.domReadyEventHandler(): "${webView.src}"`);
            this.releaseNotificationChannels();

            // TODO consider moving "notification" WebView API method back to the "accounts.effects"
            const {value: account} = this.account$;
            const {type, entryUrl, login} = account.accountConfig;
            const finishPromise = this.setupNotificationChannelReleasingTrigger();
            const subscription = this.subscription.add(
                this.electron.webViewClient(webView, type, {finishPromise})
                    .pipe(mergeMap((caller) => caller("notification")({entryUrl, zoneName: this.logger.zoneName()})))
                    .subscribe((notification) => {
                        this.dispatchInLoggerZone(ACCOUNTS_ACTIONS.NotificationPatch({login, notification}));
                    }),
            );
            // tslint:disable-next-line:no-floating-promises
            finishPromise.then(() => subscription.unsubscribe());
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
        webView.addEventListener("did-fail-load", ((options: { attempt: number, stepSeconds: number }) => {
            const setAfterFailedLoadWait = (value: number) => {
                this.afterFailedLoadWait = value;
                this.changeDetectorRef.detectChanges();
            };
            let intervalId: any = null;

            return ({errorDescription}: DidFailLoadEvent) => {
                this.logger.verbose(`webview:did-fail-load: "${webView.src}"`);

                // TODO figure ERR_NOT_IMPLEMENTED error cause, happening on password/2fa code submitting, tutanota only issue
                if (errorDescription === "ERR_NOT_IMPLEMENTED" && this.account$.value.accountConfig.type === "tutanota") {
                    return;
                }

                this.didFailLoadErrorDescription = errorDescription;

                unsubscribeDomReadyHandler();
                this.releaseNotificationChannels();

                options.attempt++;

                setAfterFailedLoadWait(Math.min(options.stepSeconds * options.attempt, 60));
                this.changeDetectorRef.detectChanges();

                intervalId = setInterval(() => {
                    setAfterFailedLoadWait(this.afterFailedLoadWait - 1);
                    this.changeDetectorRef.detectChanges();

                    if (this.afterFailedLoadWait > 0) {
                        return;
                    }

                    clearInterval(intervalId);
                    subscribeDomReadyHandler();
                    webView.reloadIgnoringCache();
                }, ONE_SECOND_MS);
            };
        })({attempt: 0, stepSeconds: 10}));
    }

    private setupNotificationChannelReleasingTrigger() {
        this.logger.info(`setupNotificationChannelReleasingTrigger()`);
        return new Promise((resolve) => this.notificationChannelsReleasingTriggers.push(resolve));
    }

    private releaseNotificationChannels() {
        this.logger.info(`releaseNotificationChannels()`);
        this.notificationChannelsReleasingTriggers.forEach((resolveTrigger) => resolveTrigger());
        // TODO remove executed functions form the array
    }
}
