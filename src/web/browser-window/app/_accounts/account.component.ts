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
import {Observable, ReplaySubject, Subject, Subscription, combineLatest, from, race, timer} from "rxjs";
import {Store, select} from "@ngrx/store";
import {
    debounceTime,
    delayWhen,
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    startWith,
    switchMap,
    take,
    withLatestFrom,
} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, AppAction, NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {DbViewModuleResolve} from "src/web/browser-window/app/_accounts/db-view-module-resolve.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {LogLevel} from "src/shared/model/common";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS, PRODUCT_NAME} from "src/shared/constants";
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

    readonly webViewsState: Readonly<Record<"primary" /* | "calendar" */, {
        readonly src$: Subject<string>;
        readonly domReadyOnce: Deferred<Electron.WebviewTag>;
        readonly domReady$: Subject<Electron.WebviewTag>;
    }>> = {
        primary: {
            src$: new ReplaySubject(1),
            domReadyOnce: new Deferred(),
            domReady$: new Subject(),
        },
    };

    @ViewChild("tplDbViewComponentContainerRef", {read: ViewContainerRef, static: true})
    private readonly tplDbViewComponentContainerRef!: ViewContainerRef;

    private readonly databaseViewToggled$ = this.account$.pipe(
        map((account) => ({
            login: account.accountConfig.login,
            databaseView: account.databaseView,
        })),
        distinctUntilChanged(({databaseView: prev}, {databaseView: curr}) => prev === curr),
        withLatestFrom(this.store.pipe(select(AccountsSelectors.FEATURED.selectedLogin))),
    );

    private readonly onlinePing$ = timer(0, ONE_SECOND_MS).pipe(
        filter(() => navigator.onLine),
        take(1),
    );

    private readonly persistentSession$ = this.account$.pipe(
        map(({accountConfig: {persistentSession}}) => Boolean(persistentSession)),
        distinctUntilChanged(),
    );

    // TODO resolve "componentIndex" dynamically: accounts$.indexOf(({login}) => this.login === login)
    private readonly componentIndex: number;

    private readonly logger: ReturnType<typeof getZoneNameBoundWebLogger>;

    private readonly loggerZone: Zone;

    private readonly subscription = new Subscription();

    @HostBinding("class")
    get getClass(): string {
        return `${this.class} ${this.viewModeClass}`;
    }

    constructor(
        private readonly dbViewModuleResolve: DbViewModuleResolve,
        private readonly accountsService: AccountsService,
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

    ngOnInit(): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.webViewsState.primary.domReadyOnce.promise
            .then((webView) => this.onPrimaryViewLoadedOnce(webView));

        this.subscription.add(
            this.account$
                .pipe(
                    distinctUntilChanged(({accountConfig: {entryUrl: prev}}, {accountConfig: {entryUrl: curr}}) => curr === prev),
                    // WARN: "switchMap" used to drop previously setup notification (we don't need them to run in parallel)
                    switchMap(({accountConfig: {login}}) => this.accountsService.setupLoginDelayTrigger({login}, this.logger)),
                    delayWhen(() => this.onlinePing$),
                    withLatestFrom(this.account$),
                )
                // TODO move subscribe handler logic to "_accounts/*.service"
                .subscribe(([, {accountConfig}]) => {
                    (async () => {
                        const project = "WebClient";
                        const {primary: state} = this.webViewsState;
                        const parsedEntryUrl = this.core.parseEntryUrl(accountConfig, project);
                        const key = {login: accountConfig.login, apiEndpointOrigin: new URL(parsedEntryUrl.entryApiUrl).origin} as const;
                        const baseReturn = async (): Promise<void> => {
                            // reset the "backend session"
                            await this.api.ipcMainClient()("resetProtonBackendSession")({login: key.login});
                            // reset the "client session" and navigate
                            await this.core.initProtonClientSessionAndNavigate(
                                accountConfig,
                                project,
                                state.domReady$,
                                (src) => state.src$.next(src),
                            );
                        };

                        if (!accountConfig.persistentSession) {
                            return baseReturn();
                        }

                        const clientSession = await this.api.ipcMainClient()("resolveSavedProtonClientSession")(key);

                        if (!clientSession) {
                            return baseReturn();
                        }

                        if (!(await this.api.ipcMainClient()("applySavedProtonBackendSession")(key))) {
                            return baseReturn();
                        }

                        await this.core.initProtonClientSessionAndNavigate(
                            accountConfig,
                            project,
                            state.domReady$,
                            (src) => state.src$.next(src),
                            clientSession,
                        );
                    })().catch((error) => {
                        // TODO make "AppErrorHandler.handleError" catch promise rejection errors
                        this.onDispatchInLoggerZone(NOTIFICATION_ACTIONS.Error(error));
                    });
                }),
        );

        this.subscription.add(
            (() => {
                let dbViewEntryComponentMounted = false;

                return this.databaseViewToggled$.subscribe(async ([{login, databaseView}]) => {
                    this.viewModeClass = databaseView
                        ? "vm-database"
                        : "vm-live";

                    if (!databaseView) {
                        this.focusPrimaryWebView();
                    } else if (!dbViewEntryComponentMounted) {
                        await this.dbViewModuleResolve.mountDbViewEntryComponent(
                            this.tplDbViewComponentContainerRef,
                            {login},
                        );
                        dbViewEntryComponentMounted = true;
                    }
                });
            })(),
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
                        this.onDispatchInLoggerZone(ACCOUNTS_ACTIONS.Select({login}));
                        this.onDispatchInLoggerZone(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                    });
                }),
        );

        // removing "proton session" on "persistent session" toggle gets disabled notification
        // WARN don't put this logic in "onPrimaryViewLoadedOnce" since it should work in offline mode too
        this.subscription.add(
            this.persistentSession$
                .pipe(
                    mergeMap((persistentSession) => persistentSession ? [] : [persistentSession]),
                    withLatestFrom(this.account$),
                )
                .subscribe(([persistentSession, {accountConfig}]) => {
                    (async () => {
                        if (persistentSession) { // just extra check
                            throw new Error(`"persistentSession" value is supposed to be "false" here`);
                        }

                        const parsedEntryUrl = this.core.parseEntryUrl(accountConfig, "WebClient");
                        const key = {login: accountConfig.login, apiEndpointOrigin: new URL(parsedEntryUrl.entryApiUrl).origin} as const;

                        await this.api.ipcMainClient()("resetSavedProtonSession")(key);
                    })().catch((error) => {
                        // TODO make "AppErrorHandler.handleError" catch promise rejection errors
                        this.onDispatchInLoggerZone(NOTIFICATION_ACTIONS.Error(error));
                    });
                }),
        );
    }

    onEventChild(
        event:
            | { type: "dom-ready"; viewType: keyof typeof AccountComponent.prototype.webViewsState; webView: Electron.WebviewTag }
            | { type: "action"; payload: Unpacked<Parameters<typeof AccountComponent.prototype.onDispatchInLoggerZone>> }
            | { type: "log"; data: [LogLevel, ...string[]] },
    ): void {
        if (event.type === "log") {
            const [level, ...args] = event.data;
            this.logger[level](...args);
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

    onPrimaryViewLoadedOnce(primaryWebView: Electron.WebviewTag): void {
        this.logger.info(`onPrimaryViewLoadedOnce()`);

        this.subscription.add(
            combineLatest([
                // notification: toggling "loggedIn" state
                this.account$.pipe(
                    map(({notifications: {loggedIn}}) => loggedIn),
                    distinctUntilChanged(),
                ),
                // notification: toggling "persistentSession" flag on the account edit form
                this.persistentSession$,
            ]).pipe(
                withLatestFrom(this.account$),
            ).subscribe(([[loggedIn, persistentSession], {accountConfig}]) => {
                (async () => {
                    const parsedEntryUrl = this.core.parseEntryUrl(accountConfig, "WebClient");
                    const key = {login: accountConfig.login, apiEndpointOrigin: new URL(parsedEntryUrl.entryApiUrl).origin} as const;

                    if (!persistentSession) {
                        return;
                    }

                    if (!loggedIn) {
                        // TODO also reset the session reset if loggedIn toggled: true => false
                        //      and page is not calendar/settings/contacts page, ie webclient page
                        return;
                    }

                    const apiClient = await this.api.webViewClient(primaryWebView).toPromise();
                    const clientSession = await apiClient("resolveSavedProtonClientSession")({zoneName: this.loggerZone.name});

                    if (!clientSession) {
                        throw new Error(`Failed to resolve ProtonClientSession object`);
                    }

                    await this.api.ipcMainClient()("saveProtonSession")({
                        ...key,
                        clientSession,
                    });
                })().catch((error) => {
                    // TODO make "AppErrorHandler.handleError" catch promise rejection errors
                    this.onDispatchInLoggerZone(NOTIFICATION_ACTIONS.Error(error));
                });
            }),
        );

        this.subscription.add(
            this.databaseViewToggled$.subscribe(async ([{databaseView}, selectedLogin]) => {
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
            ]).pipe(
                filter(([selectedLogin]) => this.account.accountConfig.login === selectedLogin),
                debounceTime(ONE_SECOND_MS * 0.3),
            ).subscribe(async () => {
                this.focusPrimaryWebView();
                await this.api.ipcMainClient()("selectAccount")({
                    databaseView: this.account.databaseView,
                    // WARN electron: "webView.getWebContentsId()" is available only after "webView.dom-ready" triggered
                    webContentId: primaryWebView.getWebContentsId(),
                });
            }),
        );
    }

    onDispatchInLoggerZone(action: AppAction): void {
        this.loggerZone.run(() => {
            this.store.dispatch(action);
        });
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.logger.info(`ngOnDestroy()`);
        this.subscription.unsubscribe();
    }

    private focusPrimaryWebView(): void {
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
