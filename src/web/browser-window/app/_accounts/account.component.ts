import {BehaviorSubject, Observable, Subject, Subscription, combineLatest, merge, of, race, throwError, timer} from "rxjs";
import {
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    ElementRef,
    HostBinding,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewContainerRef,
} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {URL} from "@cliqz/url-parser";
import {
    concatMap,
    debounce,
    debounceTime,
    delayWhen,
    distinctUntilChanged,
    filter,
    first,
    map,
    mergeMap,
    pairwise,
    startWith,
    switchMap,
    take,
    takeUntil,
    tap,
    withLatestFrom,
} from "rxjs/operators";
import {pick} from "remeda";

import {ACCOUNTS_ACTIONS, AppAction, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {DbViewEntryComponent} from "src/web/browser-window/app/_db-view/db-view-entry.component";
import {DbViewModuleResolve} from "src/web/browser-window/app/_accounts/db-view-module-resolve.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {LogLevel} from "src/shared/model/common";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS, PRODUCT_NAME} from "src/shared/constants";
import {ProtonClientSession} from "src/shared/model/proton";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";
import {curryFunctionMembers, parseUrlOriginWithNullishCheck} from "src/shared/util";
import {getWebLogger} from "src/web/browser-window/util";

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

    // TODO angular: get rid of @HostBinding("class") /  @Input() workaround https://github.com/angular/angular/issues/7289
    @Input()
    readonly class: string = "";

    viewModeClass: "vm-live" | "vm-database" = "vm-live";

    @HostBinding("class")
    get getClass(): string {
        return `${this.class} ${this.viewModeClass}`;
    }

    readonly webViewsState: Readonly<Record<"primary" | "calendar", {
        readonly src$: BehaviorSubject<string>; readonly domReady$: Subject<Electron.WebviewTag>;
    }>> = {
        primary: {src$: new BehaviorSubject(""), domReady$: new Subject()},
        calendar: {src$: new BehaviorSubject(""), domReady$: new Subject()},
    };

    @ViewChild("tplDbViewComponentContainerRef", {read: ViewContainerRef, static: true})
    private readonly tplDbViewComponentContainerRef!: ViewContainerRef;

    private readonly onlinePing$ = timer(0, ONE_SECOND_MS).pipe(
        filter(() => navigator.onLine),
        take(1),
    );

    private readonly persistentSession$ = this.account$.pipe(
        map(({accountConfig: {persistentSession}}) => Boolean(persistentSession)),
        distinctUntilChanged(),
    );

    private readonly loggedIn$ = this.account$.pipe(
        map(({notifications: {loggedIn}}) => loggedIn),
        distinctUntilChanged(),
    );

    private readonly loggedInCalendar$ = this.account$.pipe(
        map(({notifications: {loggedInCalendar}}) => loggedInCalendar),
        distinctUntilChanged(),
    );

    private readonly ipcMainClient = this.electronService.ipcMainClient();

    private readonly logger: ReturnType<typeof getWebLogger>;

    private readonly subscription = new Subscription();

    constructor(
        private readonly dbViewModuleResolve: DbViewModuleResolve,
        private readonly accountsService: AccountsService,
        private readonly electronService: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
        private readonly zone: NgZone,
    ) {
        super();
        this.logger = getWebLogger();
        this.logger.info(`constructor()`);
    }

    ngOnInit(): void {
        this.subscription.add(
            this.webViewsState.primary.domReady$.pipe(
                first(),
            ).subscribe((webView) => {
                this.onPrimaryViewLoadedOnce(webView);
            }),
        );

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
                .subscribe(async ([, {accountConfig}]) => {
                    const project = "proton-mail";
                    const {primary: webViewsState} = this.webViewsState;
                    const key = {
                        login: accountConfig.login,
                        apiEndpointOrigin: parseUrlOriginWithNullishCheck(this.core.parseEntryUrl(accountConfig, project).entryApiUrl),
                    } as const;
                    const applyProtonClientSessionAndNavigateArgs = [
                        accountConfig,
                        project,
                        webViewsState.domReady$,
                        (src: string) => webViewsState.src$.next(src),
                        this.logger,
                    ] as const;
                    const baseReturn = async (): Promise<void> => {
                        // reset the "backend session"
                        await this.ipcMainClient("resetProtonBackendSession")({login: key.login});
                        // reset the "client session" and navigate
                        await this.core.applyProtonClientSessionAndNavigate(...applyProtonClientSessionAndNavigateArgs);
                    };

                    if (!accountConfig.persistentSession) {
                        return baseReturn();
                    }

                    const clientSession = await this.ipcMainClient("resolveSavedProtonClientSession")(key);

                    if (!clientSession) {
                        return baseReturn();
                    }

                    if (!(await this.ipcMainClient("applySavedProtonBackendSession")(key))) {
                        return baseReturn();
                    }

                    await this.core.applyProtonClientSessionAndNavigate(...[
                        ...applyProtonClientSessionAndNavigateArgs,
                        clientSession,
                    ] as const);
                }),
        );

        this.subscription.add(
            (() => {
                let mountedDbViewEntryComponent: ComponentRef<DbViewEntryComponent> | undefined;
                let selectedLoginResolvingDebouncedOnce = false;

                return combineLatest([
                    this.account$.pipe(
                        map((account) => ({
                            login: account.accountConfig.login,
                            accountIndex: account.accountIndex,
                            databaseView: account.databaseView,
                        })),
                        distinctUntilChanged(({databaseView: prev}, {databaseView: curr}) => prev === curr),
                    ),
                    combineLatest([
                        this.store.pipe(
                            select(AccountsSelectors.FEATURED.selectedLogin),
                        ),
                        this.store.pipe(
                            select(OptionsSelectors.FEATURED.mainProcessNotification),
                            filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.ActivateBrowserWindow),
                            startWith(null),
                        ),
                    ]).pipe(
                        map(([selectedLogin]) => selectedLogin),
                        debounce(() => {
                            return selectedLoginResolvingDebouncedOnce
                                ? of(null) // no debouncing-based delay needed
                                : this.webViewsState.primary.domReady$ // delay until "primary webview" fires "dom-ready" event
                                    .pipe(tap(() => selectedLoginResolvingDebouncedOnce = true));
                        }),
                    ),
                ]).pipe(
                    withLatestFrom(this.webViewsState.primary.domReady$),
                ).subscribe(async ([[{login, accountIndex, databaseView}, selectedLogin], primaryWebView]) => {
                    const viewModeClass = databaseView ? "vm-database" : "vm-live";

                    if (this.viewModeClass !== viewModeClass) {
                        this.viewModeClass = viewModeClass;
                    }

                    if (databaseView) {
                        mountedDbViewEntryComponent ??= await this.dbViewModuleResolve.mountDbViewEntryComponent(
                            this.tplDbViewComponentContainerRef,
                            {login, accountIndex},
                        );
                    }

                    if (login !== selectedLogin) {
                        return;
                    }

                    await this.ipcMainClient("selectAccount")({
                        databaseView,
                        // WARN: "webView.getWebContentsId()" is available only after "webView.dom-ready" event triggering
                        webContentId: primaryWebView.getWebContentsId(),
                    });

                    this.focusVisibleViewModeContainerElement(
                        databaseView
                            ? mountedDbViewEntryComponent?.injector.get(ElementRef).nativeElement
                            : primaryWebView,
                    );
                });
            })(),
        );

        this.subscription.add(
            this.account$
                .pipe(
                    withLatestFrom(this.store.pipe(select(OptionsSelectors.CONFIG.unreadNotifications))),
                    filter(([, unreadNotifications]) => Boolean(unreadNotifications)),
                    map(([account]) => account),
                    map(({accountConfig: {login, title}, notifications: {unread}}) => ({login, title, unread})),
                    pairwise(),
                    filter(([prev, curr]) => curr.unread > prev.unread),
                    map(([, curr]) => curr),
                    withLatestFrom(
                        this.store.pipe(
                            select(OptionsSelectors.FEATURED.trayIconDataURL),
                        ),
                    ),
                )
                .subscribe(([{login, unread, title}, trayIconDataURL]) => {
                    new Notification(
                        PRODUCT_NAME,
                        {
                            icon: trayIconDataURL,
                            body: `Account [${title || this.account.accountIndex}]: ${unread} unread message${unread > 1 ? "s" : ""}.`,
                        },
                    ).onclick = () => this.zone.run(() => {
                        this.onDispatch(ACCOUNTS_ACTIONS.Select({login}));
                        this.onDispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
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
                .subscribe(async ([persistentSession, {accountConfig}]) => {
                    if (persistentSession) { // just extra check
                        throw new Error(`"persistentSession" value is supposed to be "false" here`);
                    }

                    const parsedEntryUrl = this.core.parseEntryUrl(accountConfig, "proton-mail");
                    const key = {login: accountConfig.login, apiEndpointOrigin: new URL(parsedEntryUrl.entryApiUrl).origin} as const;

                    await this.ipcMainClient("resetSavedProtonSession")(key);
                }),
        );
    }

    onEventChild(
        event:
            | { type: "dom-ready"; viewType: keyof typeof AccountComponent.prototype.webViewsState; webView: Electron.WebviewTag }
            | { type: "action"; payload: Unpacked<Parameters<typeof AccountComponent.prototype.onDispatch>> }
            | { type: "log"; data: [LogLevel, ...string[]] },
    ): void {
        if (event.type === "log") {
            const [level, ...args] = event.data;
            this.logger[level](...args);
            return;
        }

        if (event.type === "action") {
            this.onDispatch(event.payload);
            return;
        }

        this.webViewsState[event.viewType].domReady$.next(event.webView);
    }

    onPrimaryViewLoadedOnce(primaryWebView: Electron.WebviewTag): void {
        this.logger.info("onPrimaryViewLoadedOnce()");

        const resolveSavedProtonClientSession = async (): Promise<ProtonClientSession> => {
            const apiClient = await this.electronService
                .primaryWebViewClient({webView: primaryWebView, accountIndex: this.account.accountIndex})
                .toPromise();
            const value = await apiClient("resolveSavedProtonClientSession")(pick(this.account, ["accountIndex"]));

            if (!value) {
                throw new Error(`Failed to resolve "proton client session" object`);
            }

            return value;
        };

        {
            const logger = curryFunctionMembers(this.logger, "saving proton session");

            this.subscription.add(
                this.store.pipe(
                    select(OptionsSelectors.CONFIG.persistentSessionSavingInterval),
                    switchMap((persistentSessionSavingInterval) => {
                        return combineLatest([
                            this.loggedIn$.pipe(
                                tap((value) => logger.verbose("trigger: loggedIn$", value)),
                            ),
                            this.persistentSession$.pipe(
                                tap((value) => logger.verbose("trigger: persistentSession$", value)),
                            ),
                            merge(
                                of(null), // fired once to unblock the "combineLatest"
                                this.store.pipe(
                                    select(OptionsSelectors.FEATURED.mainProcessNotification),
                                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.ProtonSessionTokenCookiesModified),
                                    debounceTime(ONE_SECOND_MS),
                                    withLatestFrom(this.account$),
                                    filter(([{payload: {key}}, {accountConfig: {login}}]) => key.login === login),
                                    tap(() => logger.verbose("trigger: proton session token cookies modified")),
                                ),
                            ),
                            (
                                persistentSessionSavingInterval > 0 // negative value skips the interval-based trigger
                                    ? (
                                        timer(0, persistentSessionSavingInterval).pipe(
                                            tap((value) => logger.verbose("trigger: interval", value)),
                                        )
                                    )
                                    : of(null) // fired once to unblock the "combineLatest"
                            ),
                        ]).pipe(
                            filter(([loggedIn, persistentSession]) => persistentSession && loggedIn),
                            withLatestFrom(this.account$),
                        );
                    }),
                ).subscribe(async ([, {accountConfig}]) => {
                    const ipcMainAction = "saveProtonSession";

                    logger.verbose(ipcMainAction);

                    await this.ipcMainClient(ipcMainAction)({
                        login: accountConfig.login,
                        clientSession: await resolveSavedProtonClientSession(),
                        apiEndpointOrigin: parseUrlOriginWithNullishCheck(
                            this.core.parseEntryUrl(accountConfig, "proton-mail").entryApiUrl,
                        ),
                    });
                }),
            );
        }

        this.subscription.add(
            combineLatest([
                this.loggedIn$,
                this.loggedInCalendar$,
                this.store.pipe(
                    select(OptionsSelectors.CONFIG.calendarNotification),
                ),
            ]).pipe(
                withLatestFrom(
                    this.account$,
                    this.store.pipe(
                        select(OptionsSelectors.CONFIG.timeouts),
                    ),
                ),
            ).subscribe(async (
                [[loggedIn, loggedInCalendar, calendarNotification], {accountConfig}, {webViewApiPing: calendarGetsSignedInStateTimeoutMs}]
            ) => {
                if (!calendarNotification) {
                    // TODO make sure that calendar-related component/webview actually disappears
                    this.webViewsState.calendar.src$.next("");
                    return;
                }
                if (!loggedIn || loggedInCalendar) {
                    return;
                }

                // TODO if "src$" has been set before, consider only refreshing the client session without full page reload

                await Promise.all([
                    // the app shares the same backend between mail and calendar, so applying here only the client session
                    await this.core.applyProtonClientSessionAndNavigate(
                        accountConfig,
                        "proton-calendar",
                        this.webViewsState.calendar.domReady$,
                        (src: string) => this.webViewsState.calendar.src$.next(src),
                        this.logger,
                        await resolveSavedProtonClientSession(),
                    ),
                    race(
                        this.loggedInCalendar$.pipe(
                            filter(Boolean),
                        ),
                        timer(calendarGetsSignedInStateTimeoutMs).pipe(
                            concatMap(() => throwError(
                                new Error(`The Calendar has not got the signed-in stage in ${calendarGetsSignedInStateTimeoutMs}ms`)),
                            ),
                        ),
                    ).toPromise(),
                ]);
            }),
        );
    }

    onDispatch(action: AppAction): void {
        this.store.dispatch(action);
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.logger.info("ngOnDestroy()");
        this.subscription.unsubscribe();
    }

    private focusVisibleViewModeContainerElement(
        element: Partial<Pick<Electron.WebviewTag, "offsetParent" | "focus" | "executeJavaScript">>,
    ): void {
        timer(0, ONE_SECOND_MS / 10).pipe( // run test every 0.1 sec
            filter(() => Boolean(element.offsetParent) /* filter visible element */),
            take(1),
            takeUntil(timer(ONE_SECOND_MS * 0.7)), // wait 0.7 sec for webview gets visible
        ).subscribe(() => {
            if (typeof element.focus === "function") {
                element.focus();
            }
            if (this.viewModeClass !== "vm-live" || typeof element.executeJavaScript !== "function") {
                return;
            }
            // CSS selector value defined in "./patches/protonmail/proton-mail.patch"
            element
                .executeJavaScript(`
                    setTimeout(
                        () => {
                            const el = document.querySelector(".electron-mail-mailbox-container-component");
                            if (/* visibility test */ el?.offsetParent && typeof el.focus === "function") {
                                el.focus();
                            }
                        },
                        ${ONE_SECOND_MS / 2},
                    );`,
                )
                .catch((error) => {
                    this.logger.error("failed to focus protonmail mailbox container DOM element", error);
                });
        });
    }
}
