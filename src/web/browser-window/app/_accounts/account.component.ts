import type {Action} from "@ngrx/store";
import {BehaviorSubject, combineLatest, Subject, timer} from "rxjs";
import {Component, ComponentRef, ElementRef, HostBinding, inject, Input, NgZone, ViewChild, ViewContainerRef} from "@angular/core";
import {
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
    withLatestFrom,
} from "rxjs/operators";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {AccountLoginAwareDirective} from "./account.ng-changes-observable.directive";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "./accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {DbViewEntryComponent} from "src/web/browser-window/app/_db-view/db-view-entry.component";
import {DbViewModuleResolve} from "./db-view-module-resolve.service";
import {DESKTOP_NOTIFICATION_ICON_URL} from "src/web/constants";
import {getWebLogger, sha256} from "src/web/browser-window/util";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {LogLevel} from "src/shared/model/common";
import {ofType} from "src/shared/util/ngrx-of-type";
import {ONE_SECOND_MS, PRODUCT_NAME} from "src/shared/const";
import {State} from "src/web/browser-window/app/store/reducers/accounts";

const componentDestroyingNotificationSubject$ = new Subject<void>();

@Component({
    standalone: false,
    selector: "electron-mail-account",
    templateUrl: "./account.component.html",
    styleUrls: ["./account.component.scss"],
})
export class AccountViewComponent extends AccountLoginAwareDirective implements OnInit, OnDestroy {
    private readonly core = inject(CoreService);
    private readonly store = inject<Store<State>>(Store);
    private readonly zone = inject(NgZone);

    static componentDestroyingNotification$ = componentDestroyingNotificationSubject$.asObservable();

    private readonly logger = getWebLogger(__filename, nameof(AccountViewComponent));

    // TODO angular: get rid of @HostBinding("class") /  @Input() workaround https://github.com/angular/angular/issues/7289
    @Input({required: false})
    readonly class: string = "";

    viewModeClass: "vm-live" | "vm-database" = "vm-live";
    readonly webViewsState: Readonly<
        Record<"primary", {readonly src$: BehaviorSubject<string>; readonly domReady$: Subject<Electron.WebviewTag>}>
    > = {
        primary: {src$: new BehaviorSubject(""), domReady$: new Subject()},
    };
    @ViewChild("tplDbViewComponentContainerRef", {read: ViewContainerRef, static: true})
    private readonly tplDbViewComponentContainerRef!: ViewContainerRef;

    @HostBinding("class")
    get getClass(): string {
        return `${this.class} ${this.viewModeClass}`;
    }

    constructor() {
        super();
        this.logger.info();
    }

    ngOnInit(): void {
        this.addSubscription(
            this.account$
                .pipe(
                    // processing just first/initial value here
                    // account reloading with a new session in the case of "entryUrl" change gets handled via the "unload" action call
                    first(),
                    switchMap(({accountConfig: {login}}) => {
                        return this.injector.get(AccountsService).setupLoginDelayTrigger(
                            {login, takeUntil$: this.webViewsState.primary.domReady$.asObservable()},
                            this.logger,
                        );
                    }),
                    withLatestFrom(this.account$),
                )
                // TODO move subscribe handler logic to "_accounts/*.service"
                .subscribe(async ([, {accountConfig}]) => {
                    const {primary: webViewsState} = this.webViewsState;
                    const key = {
                        login: accountConfig.login,
                        ...this.core.parseSessionStorageOrigin(accountConfig),
                    } as const;
                    const applyProtonClientSessionAndNavigateArgs = [
                        accountConfig,
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
                            ...applyProtonClientSessionAndNavigateArgs,
                            {sessionStoragePatch},
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
                    await this.core.applyProtonClientSessionAndNavigate(
                        ...[
                            ...applyProtonClientSessionAndNavigateArgs,
                            {clientSession, sessionStoragePatch},
                        ] as const,
                    );
                }),
        );

        this.addSubscription(
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
                        mountedDbViewEntryComponent ??= await this.injector.get(DbViewModuleResolve).mountDbViewEntryComponent(
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

        this.addSubscription(
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
                                && database
                                && (await this.ipcMainClient("dbGetAccountMetadata")({login}))?.latestEventId,
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
                            ).onclick = () =>
                                this.zone.run(() => {
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
        this.addSubscription(
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
            | {type: "did-start-navigation"; url: string}
            | {type: "ipc-message"; channel: string; webView: Electron.WebviewTag}
            | {type: "dom-ready"; viewType: keyof typeof AccountViewComponent.prototype.webViewsState; webView: Electron.WebviewTag}
            | {type: "action"; payload: Action}
            | {type: "log"; data: [LogLevel, ...string[]]},
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
        if (event.type === "dom-ready") {
            this.webViewsState[event.viewType].domReady$.next(event.webView);
        }
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.logger.info(nameof(AccountViewComponent.prototype.ngOnDestroy)); // eslint-disable-line @typescript-eslint/unbound-method
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
                    );`)
                .catch((error) => {
                    this.logger.error("failed to focus protonmail mailbox container DOM element", error);
                });
        });
    }
}
