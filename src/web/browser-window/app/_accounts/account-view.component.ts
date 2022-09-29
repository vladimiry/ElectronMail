import type {Action} from "@ngrx/store";
import {
    BehaviorSubject, combineLatest, EMPTY, firstValueFrom, lastValueFrom, merge, of, race, Subject, Subscription, throwError, timer,
} from "rxjs";
import {Component, ComponentRef, ElementRef, HostBinding, Input, NgZone, ViewChild, ViewContainerRef} from "@angular/core";
import {
    concatMap, debounceTime, distinctUntilChanged, filter, first, map, mergeMap, pairwise, startWith, switchMap, take, takeUntil, tap,
    withLatestFrom,
} from "rxjs/operators";
import type {Observable} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "./accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {curryFunctionMembers} from "src/shared/util";
import {DbViewEntryComponent} from "src/web/browser-window/app/_db-view/db-view-entry.component";
import {DbViewModuleResolve} from "./db-view-module-resolve.service";
import {DESKTOP_NOTIFICATION_ICON_URL} from "src/web/constants";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {getWebLogger, sha256} from "src/web/browser-window/util";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {LogLevel} from "src/shared/model/common";
import {NgChangesObservableComponent} from "src/web/browser-window/app/components/ng-changes-observable.component";
import {ofType} from "src/shared/util/ngrx-of-type";
import {ONE_SECOND_MS, PRODUCT_NAME} from "src/shared/const";
import {ProtonClientSession} from "src/shared/model/proton";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import type {WebAccount} from "src/web/browser-window/app/model";

const componentDestroyingNotificationSubject$ = new Subject<void>();

@Component({
    selector: "electron-mail-account-view",
    templateUrl: "./account-view.component.html",
    styleUrls: ["./account-view.component.scss"],
})
export class AccountViewComponent extends NgChangesObservableComponent implements OnInit, OnDestroy {
    static componentDestroyingNotification$ = componentDestroyingNotificationSubject$.asObservable();

    @Input()
    readonly login: string = "";

    readonly account$: Observable<WebAccount> = this.ngChangesObservable("login").pipe(
        switchMap((login) => this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
            mergeMap((account) => account ? [account] : EMPTY),
        )),
    );

    // TODO angular: get rid of @HostBinding("class") /  @Input() workaround https://github.com/angular/angular/issues/7289
    @Input()
    readonly class: string = "";

    viewModeClass: "vm-live" | "vm-database" = "vm-live";
    readonly webViewsState: Readonly<Record<"primary" | "calendar", {
        readonly src$: BehaviorSubject<string>; readonly domReady$: Subject<Electron.WebviewTag>;
    }>> = {
        primary: {src$: new BehaviorSubject(""), domReady$: new Subject()},
        calendar: {src$: new BehaviorSubject(""), domReady$: new Subject()},
    };
    @ViewChild("tplDbViewComponentContainerRef", {read: ViewContainerRef, static: true})
    private readonly tplDbViewComponentContainerRef!: ViewContainerRef;
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
    private readonly ipcMainClient;
    private readonly logger: ReturnType<typeof getWebLogger>;
    private readonly subscription = new Subscription();

    @HostBinding("class")
    get getClass(): string {
        return `${this.class} ${this.viewModeClass}`;
    }

    constructor(
        private readonly dbViewModuleResolve: DbViewModuleResolve,
        private readonly accountsService: AccountsService,
        private readonly electronService: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
        private readonly zone: NgZone,
        // private readonly changeDetectorRef: ChangeDetectorRef,
    ) {
        super();
        this.ipcMainClient = this.electronService.ipcMainClient();
        this.logger = getWebLogger(__filename, nameof(AccountViewComponent));
        this.logger.info();
    }

    private async resolveAccountIndex(): Promise<Pick<WebAccount, "accountIndex">> {
        return {accountIndex: (await lastValueFrom(this.account$.pipe(take(1)))).accountIndex};
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
                    // processing just first/initial value here
                    // account reloading with a new session in the case of "entryUrl" change gets handled via the "unload" action call
                    first(),
                    switchMap(({accountConfig: {login}}) => {
                        return this.accountsService.setupLoginDelayTrigger(
                            {login, takeUntil$: this.webViewsState.primary.domReady$.asObservable()}, this.logger,
                        );
                    }),
                    withLatestFrom(this.account$),
                )
                // TODO move subscribe handler logic to "_accounts/*.service"
                .subscribe(async ([, {accountConfig}]) => {
                    const project = "proton-mail";
                    const {primary: webViewsState} = this.webViewsState;
                    const key = {
                        login: accountConfig.login,
                        apiEndpointOrigin: this.core.parseEntryUrl(accountConfig, project).sessionStorage.apiEndpointOrigin,
                    } as const;
                    const applyProtonClientSessionAndNavigateArgs = [
                        accountConfig,
                        project,
                        webViewsState.domReady$,
                        (src: string) => webViewsState.src$.next(src),
                        this.logger,
                        this.ngOnDestroy$.asObservable(),
                    ] as const;
                    const sessionStoragePatch = await this.ipcMainClient("resolvedSavedSessionStoragePatch")(key);
                    const baseReturn = async (): Promise<void> => {
                        // reset the "backend session"
                        await this.ipcMainClient("resetProtonBackendSession")(key);
                        // reset the "client session" and navigate
                        await this.core.applyProtonClientSessionAndNavigate(
                            ...applyProtonClientSessionAndNavigateArgs, {sessionStoragePatch},
                        );
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
                        {clientSession, sessionStoragePatch},
                    ] as const);
                }),
        );

        this.subscription.add(
            (() => {
                let mountedDbViewEntryComponent: ComponentRef<DbViewEntryComponent> | undefined;
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
                            select(OptionsSelectors.FEATURED.mainProcessNotificationAction),
                            ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow),
                            startWith(null),
                        ),
                    ]).pipe(
                        map(([selectedLogin]) => selectedLogin),
                    ),
                    this.webViewsState.primary.domReady$.pipe(
                        startWith(null),
                        take(2), // "null" value and then first "dom-read" value
                    ),
                ]).subscribe(async ([{login, accountIndex, databaseView}, selectedLogin, primaryWebView]) => {
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
                        login,
                        databaseView,
                        // WARN: "webView.getWebContentsId()" is available only after "webView.dom-ready" event triggering
                        webContentId: primaryWebView?.getWebContentsId(),
                    });
                    this.focusVisibleViewModeContainerElement(
                        databaseView // eslint-disable-line @typescript-eslint/no-unsafe-argument
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
                    pairwise(),
                    filter(([prev, curr]) => curr.notifications.unread > prev.notifications.unread),
                    map(([, curr]) => curr),
                )
                .subscribe(
                    async (
                        {
                            accountConfig: {
                                login,
                                title,
                                database,
                                customNotificationCode,
                                customNotification,
                                notificationShellExec,
                                notificationShellExecCode,
                            },
                            notifications: {unread},
                        },
                    ) => {
                        const useCustomNotification = customNotification && customNotificationCode;
                        const executeShellCommand = notificationShellExec && notificationShellExecCode;
                        const accountMetadataSettled = Boolean(
                            (useCustomNotification || executeShellCommand)
                            &&
                            database
                            &&
                            (await this.ipcMainClient("dbGetAccountMetadata")({login}))?.latestEventId
                        );
                        const {accountIndex} = await this.resolveAccountIndex();
                        const body = useCustomNotification && accountMetadataSettled
                            ? await this.ipcMainClient("resolveUnreadNotificationMessage")({
                                login,
                                alias: title,
                                code: customNotificationCode,
                            })
                            : `Account [${title || accountIndex}]: ${unread} unread message${unread > 1 ? "s" : ""}.`;
                        if (body) {
                            new Notification(
                                PRODUCT_NAME,
                                {
                                    body,
                                    tag: `main_unread_notification_${await sha256(login)}`,
                                    icon: DESKTOP_NOTIFICATION_ICON_URL,
                                },
                            ).onclick = () => this.zone.run(() => {
                                this.store.dispatch(ACCOUNTS_ACTIONS.Select({login}));
                                this.store.dispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                            });
                        } else {
                            this.logger.verbose(`skipping notification displaying due to the empty "${nameof(body)}"`);
                        }
                        if (executeShellCommand && accountMetadataSettled) {
                            // TODO make the "notification shell exec" timeout configurable
                            await this.ipcMainClient("executeUnreadNotificationShellCommand", {timeoutMs: ONE_SECOND_MS * 30})({
                                login,
                                alias: title,
                                code: notificationShellExecCode,
                            });
                        }
                    },
                ),
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
                    await this.ipcMainClient("resetSavedProtonSession")({
                        login: accountConfig.login,
                        apiEndpointOrigin: this.core.parseEntryUrl(accountConfig, "proton-mail").sessionStorage.apiEndpointOrigin,
                    });
                }),
        );
    }

    onEventChild(
        event:
            | { type: "dom-ready"; viewType: keyof typeof AccountViewComponent.prototype.webViewsState; webView: Electron.WebviewTag }
            | { type: "action"; payload: Action }
            | { type: "log"; data: [LogLevel, ...string[]] },
    ): void {
        if (event.type === "log") {
            const [level, ...args] = event.data;
            this.logger[level](...args);
            return;
        }
        if (event.type === "action") {
            this.store.dispatch(event.payload);
            return;
        }
        this.webViewsState[event.viewType].domReady$.next(event.webView);
    }

    onPrimaryViewLoadedOnce(primaryWebView: Electron.WebviewTag): void {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.logger.info(nameof(AccountViewComponent.prototype.onPrimaryViewLoadedOnce));

        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        const resolvePrimaryWebViewApiClient = async () => firstValueFrom(
            this.electronService
                .primaryWebViewClient({webView: primaryWebView, ...await this.resolveAccountIndex()}, {pingTimeoutMs: 7000}),
        );
        const resolveLiveProtonClientSession = async (): Promise<ProtonClientSession> => {
            const apiClient = await resolvePrimaryWebViewApiClient();
            const value = await apiClient("resolveLiveProtonClientSession")(await this.resolveAccountIndex());
            if (!value) {
                throw new Error(`Failed to resolve "proton client session" object`);
            }
            return value;
        };

        {
            const logger = curryFunctionMembers(
                this.logger,
                nameof(AccountViewComponent.prototype.onPrimaryViewLoadedOnce), // eslint-disable-line @typescript-eslint/unbound-method
                "saving proton session",
            );
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
                                    select(OptionsSelectors.FEATURED.mainProcessNotificationAction),
                                    ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.ProtonSessionTokenCookiesModified),
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
                        clientSession: await resolveLiveProtonClientSession(),
                        apiEndpointOrigin: this.core.parseEntryUrl(accountConfig, "proton-mail").sessionStorage.apiEndpointOrigin,
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
                const project = "proton-calendar";
                const [clientSession, sessionStoragePatch] = await Promise.all([
                    resolveLiveProtonClientSession(),
                    (async () => {
                        const apiClient = await resolvePrimaryWebViewApiClient();
                        return apiClient("resolvedLiveSessionStoragePatch")(await this.resolveAccountIndex());
                    })(),
                ]);
                // TODO if "src$" has been set before, consider only refreshing the client session without full page reload
                await Promise.all([
                    // the app shares the same backend between mail and calendar, so applying here only the client session
                    await this.core.applyProtonClientSessionAndNavigate(
                        accountConfig,
                        project,
                        this.webViewsState.calendar.domReady$,
                        (src: string) => this.webViewsState.calendar.src$.next(src),
                        this.logger,
                        this.ngOnDestroy$.asObservable(),
                        {clientSession, sessionStoragePatch},
                    ),
                    firstValueFrom(
                        race(
                            this.loggedInCalendar$.pipe(
                                filter(Boolean),
                            ),
                            timer(calendarGetsSignedInStateTimeoutMs).pipe(
                                concatMap(() => throwError(
                                    new Error(`The Calendar has not got the signed-in stage in ${calendarGetsSignedInStateTimeoutMs}ms`)),
                                ),
                            ),
                        ),
                    ),
                ]);
            }),
        );
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.logger.info(nameof(AccountViewComponent.prototype.ngOnDestroy)); // eslint-disable-line @typescript-eslint/unbound-method
        this.subscription.unsubscribe();
        componentDestroyingNotificationSubject$.next();
    }

    private focusVisibleViewModeContainerElement(
        element: undefined | null | Partial<Pick<Electron.WebviewTag, "offsetParent" | "focus" | "executeJavaScript">>,
    ): void {
        if (!element) {
            return;
        }
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
