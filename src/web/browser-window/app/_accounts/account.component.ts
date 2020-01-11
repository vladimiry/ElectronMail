import UUID from "pure-uuid";
import {
    ChangeDetectionStrategy,
    Component,
    HostBinding,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewContainerRef,
} from "@angular/core";
import {Deferred} from "ts-deferred";
import {EMPTY, Observable, ReplaySubject, Subject, Subscription, combineLatest, from, race, throwError, timer} from "rxjs";
import {Store, select} from "@ngrx/store";
import {
    debounceTime,
    distinctUntilChanged,
    filter,
    first,
    map,
    pairwise,
    startWith,
    switchMap,
    take,
    takeUntil,
    withLatestFrom,
} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, AppAction, NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {DbViewModuleResolve} from "src/web/browser-window/app/_accounts/db-view-module-resolve.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {LogLevel} from "src/shared/model/common";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS, PRODUCT_NAME, PROVIDER_REPOS} from "src/shared/constants";
import {ReadonlyDeep} from "type-fest";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

let componentIndex = 0;

@Component({
    selector: "electron-mail-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent extends NgChangesObservableComponent implements OnInit, OnDestroy {
    @Input()
    readonly account!: WebAccount;

    readonly account$: Observable<WebAccount> = this.ngChangesObservable("account");

    viewModeClass: "vm-live" | "vm-database" = "vm-live";

    // TODO angular: get rid of @HostBinding("class") /  @Input() workaround https://github.com/angular/angular/issues/7289
    @Input()
    readonly class: string = "";

    readonly webViewsState: Record<"primary" | "calendar", ReadonlyDeep<{
        readonly src$: Subject<string>;
        readonly domReadyOnce: Deferred<Electron.WebviewTag>;
        readonly domReady$: Subject<Electron.WebviewTag>;
    }>> = {
        primary: {
            src$: new ReplaySubject(1),
            domReadyOnce: new Deferred(),
            domReady$: new Subject(),
        },
        calendar: {
            src$: new ReplaySubject(1),
            domReadyOnce: new Deferred(),
            domReady$: new Subject(),
        },
    };

    @ViewChild("tplDbViewComponentContainerRef", {read: ViewContainerRef, static: true})
    private readonly tplDbViewComponentContainerRef!: ViewContainerRef;

    private tplDbViewComponentRef: Unpacked<ReturnType<typeof DbViewModuleResolve.prototype.buildComponentRef>> | undefined;

    // TODO resolve "componentIndex" dynamically: accounts$.indexOf(({login}) => this.login === login)
    private readonly componentIndex: number;

    private readonly logger: ReturnType<typeof getZoneNameBoundWebLogger>;

    private readonly loggerZone: Zone;

    private readonly subscription = new Subscription();

    @HostBinding("class")
    get getClass() {
        return `${this.class} ${this.viewModeClass}`;
    }

    constructor(
        private readonly dbViewModuleResolve: DbViewModuleResolve,
        private readonly api: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
        private readonly zone: NgZone,
    ) {
        super();
        this.componentIndex = componentIndex;
        const loggerPrefix = `[account.component][${componentIndex++}]`;
        this.loggerZone = Zone.current.fork({name: loggerPrefix});
        this.logger = getZoneNameBoundWebLogger(loggerPrefix);
        this.logger.info(`constructor()`);
    }

    ngOnInit() {
        this.webViewsState.primary.domReadyOnce.promise
            // tslint:disable-next-line:no-floating-promises
            .then((webView) => this.onPrimaryViewLoadedOnce(webView));

        this.subscription.add(
            this.account$
                .pipe(
                    distinctUntilChanged(({accountConfig: {entryUrl: prev}}, {accountConfig: {entryUrl: curr}}) => curr === prev),
                )
                .subscribe(({accountConfig}) => {
                    this.webViewsState.primary.src$.next(
                        this.core.parseEntryUrl(accountConfig, "WebClient").entryUrl,
                    );
                }),
        );

        this.subscription.add(
            this.account$
                .pipe(
                    withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.unreadNotifications))),
                    filter(([, unreadNotifications]) => Boolean(unreadNotifications)),
                    map(([account]) => account),
                    map((account) => ({login: account.accountConfig.login, unread: account.notifications.unread})),
                    pairwise(),
                    filter(([prev, curr]) => curr.unread > prev.unread),
                    map(([, curr]) => curr),
                    withLatestFrom(
                        this.store.pipe(
                            select(OptionsSelectors.FEATURED.trayIconDataURL),
                        ),
                    ),
                )
                .subscribe(([{login, unread}, trayIconDataURL]) => {
                    new Notification(
                        PRODUCT_NAME,
                        {
                            icon: trayIconDataURL,
                            body: `Account [${this.componentIndex}]: ${unread} unread message${unread > 1 ? "s" : ""}.`,
                        },
                    ).onclick = () => this.zone.run(() => {
                        this.onDispatchInLoggerZone(ACCOUNTS_ACTIONS.Activate({login}));
                        this.onDispatchInLoggerZone(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                    });
                }),
        );
    }

    onEventChild(
        event:
            | { type: "dom-ready", viewType: keyof typeof AccountComponent.prototype.webViewsState, webView: Electron.WebviewTag; }
            | { type: "action", payload: Unpacked<Parameters<typeof AccountComponent.prototype.onDispatchInLoggerZone>> }
            | { type: "log", data: [LogLevel, ...string[]] },
    ) {
        if (event.type === "log") {
            this.logger[event.data[0]](...event.data[1]);
            return;
        }

        if (event.type === "action") {
            this.onDispatchInLoggerZone(event.payload);
            return;
        }

        const {domReadyOnce, domReady$} = this.webViewsState[event.viewType];
        domReadyOnce.resolve(event.webView);
        domReady$.next(event.webView);
    }

    onPrimaryViewLoadedOnce(primaryWebView: Electron.WebviewTag) {
        this.logger.info(`onPrimaryViewLoadedOnce()`);

        const primaryWebViewClient = (() => {
            let client: Unpacked<ReturnType<typeof ElectronService.prototype.webViewClient>> | undefined;
            const result = async () => client || (client = await this.api.webViewClient(primaryWebView).toPromise());
            return result;
        })();

        let calendarWebView: Electron.WebviewTag | undefined;

        // TODO make hidden "calendar" view auto-load optional (only of specific option is checked on the account settings form)
        this.subscription.add(
            this.account$.pipe(
                filter(({accountConfig: {localCalendarStore}}) => Boolean(localCalendarStore)),
                distinctUntilChanged(({notifications: {loggedIn: prev}}, {notifications: {loggedIn: curr}}) => curr === prev),
                switchMap(async ({accountConfig}) => {
                    // TODO request "resolveSharedSession" from calendar page too
                    //      and then skip page refresh if sessions on primary and calendar page are the equal
                    const sharedSession = await (await primaryWebViewClient())("resolveSharedSession")({zoneName: this.loggerZone.name});

                    if (!sharedSession) {
                        return throwError(new Error(`Failed to resolve shared session object`));
                    }

                    const project = "proton-calendar";
                    const projectEntryUrl = this.core.parseEntryUrl(accountConfig, project).entryUrl;
                    const loaderId = new UUID(4).format();
                    const loaderIdParam = "loader-id";
                    const loaderIdTimeoutMs = ONE_SECOND_MS * 2;
                    const loaderSrc = `${new URL(projectEntryUrl).origin}/blank.html?${loaderIdParam}=${loaderId}`;

                    setTimeout(() => this.webViewsState.calendar.src$.next(loaderSrc));

                    try {
                        calendarWebView = await this.webViewsState.calendar.domReady$.pipe(
                            filter(({src}) => !!src && new URL(src).searchParams.get(loaderIdParam) === loaderId),
                            takeUntil(timer(loaderIdTimeoutMs)),
                            first(), // "first() throws error if stream closed without any event passed through"
                        ).toPromise();
                    } catch {
                        return throwError(new Error(`Failed to load "${loaderSrc}" page in ${loaderIdTimeoutMs}ms`));
                    }

                    const loaderCodeToExecute = `
                        window.name = ${JSON.stringify(sharedSession.windowName)};
                        for (const [key, value] of Object.entries(JSON.parse(${JSON.stringify(sharedSession.sessionStorage)}))) {
                            window.sessionStorage.setItem(key, value);
                        }
                        // window.location.assign(${JSON.stringify(projectEntryUrl)});
                        window.location.assign("./${PROVIDER_REPOS[project].baseDir}")
                    `;

                    try {
                        await calendarWebView.executeJavaScript(loaderCodeToExecute);
                    } catch (error) {
                        const baseMessage = `Failed to set shared session object on "${loaderSrc}" page ("executeJavaScript")`;
                        if (BUILD_ENVIRONMENT === "development") {
                            console.log(baseMessage, error); // tslint:disable-line:no-console
                        }
                        // not showing/logging the original error it might contain sensitive stuff
                        return throwError(new Error(baseMessage));
                    }

                    return EMPTY;
                }),
            ).subscribe(
                () => { /* NOOP */ },
                (error) => this.onDispatchInLoggerZone(NOTIFICATION_ACTIONS.Error(error)),
            ),
        );

        this.subscription.add(
            this.account$
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
                    this.viewModeClass = databaseView
                        ? "vm-database"
                        : "vm-live";

                    if (!databaseView) {
                        this.focusPrimaryWebView();
                    } else if (!this.tplDbViewComponentRef) {
                        // lazy-load the local database view component ("local store" feature)
                        this.tplDbViewComponentRef = await this.dbViewModuleResolve.buildComponentRef({type, login});
                        this.tplDbViewComponentContainerRef.insert(this.tplDbViewComponentRef.hostView);
                        this.tplDbViewComponentRef.changeDetectorRef.detectChanges();
                    }

                    // tslint:disable-next-line:early-exit
                    if (this.account.accountConfig.login === selectedLogin) {
                        await this.api.ipcMainClient()("selectAccount")({
                            databaseView,
                            // WARN electron: "webView.getWebContentsId()" is available only after "webView.dom-ready" triggered
                            webContentId: primaryWebView.getWebContentsId(),
                        });
                    }
                }),
        );

        this.subscription.add(
            combineLatest([
                this.store.pipe(
                    select(AccountsSelectors.FEATURED.selectedLogin),
                ),
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.mainProcessNotification),
                    startWith(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow()),
                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.ActivateBrowserWindow),
                ),
                this.account$,
            ]).pipe(
                filter(([selectedLogin, , account]) => account.accountConfig.login === selectedLogin),
                debounceTime(ONE_SECOND_MS * 0.3),
            ).subscribe(async ([, , account]) => {
                this.focusPrimaryWebView();
                await this.api.ipcMainClient()("selectAccount")({
                    databaseView: account.databaseView,
                    // WARN electron: "webView.getWebContentsId()" is available only after "webView.dom-ready" triggered
                    webContentId: primaryWebView.getWebContentsId(),
                });
            }),
        );
    }

    onDispatchInLoggerZone(action: AppAction) {
        this.loggerZone.run(() => {
            this.store.dispatch(action);
        });
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        this.logger.info(`ngOnDestroy()`);
        this.subscription.unsubscribe();
        if (this.tplDbViewComponentRef) {
            // TODO angular: there is probably no need to trigger this "destroy" explicitly
            //      debug the db-view component to verify that
            this.tplDbViewComponentRef.destroy();
        }
    }

    private focusPrimaryWebView() {
        setTimeout(() => {
            const activeElement = document.activeElement as (null | { blur?: () => void });

            if (activeElement && typeof activeElement.blur === "function") {
                activeElement.blur();
            }

            race([
                from(this.webViewsState.primary.domReadyOnce.promise).pipe(
                    filter((webView) => Boolean(webView.offsetParent)), // picking only visible element
                ),
                timer(300 /* 300ms */).pipe(map(() => null)),
            ]).pipe(take(1)).subscribe((value) => {
                if (!value) {
                    return;
                }
                value.blur();
                value.focus();
            });
        });
    }
}
