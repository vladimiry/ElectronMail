import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from, merge, of, timer} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {catchError, concatMap, filter, finalize, map, mergeMap, startWith, switchMap, take, withLatestFrom} from "rxjs/operators";

import {ACCOUNTS_OUTLET, ACCOUNTS_PATH, SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {ONE_SECOND_MS, PRODUCT_NAME, UPDATE_CHECK_FETCH_TIMEOUT} from "src/shared/constants";
import {OptionsService} from "src/web/browser-window/app/_options/options.service";
import {ProgressPatch, State} from "src/web/browser-window/app/store/reducers/options";
import {curryFunctionMembers} from "src/shared/util";
import {getWebLogger} from "src/web/browser-window/util";

const _logger = getWebLogger("[options.effects]");

@Injectable()
export class OptionsEffects {
    ipcMainClient = this.api.ipcMainClient();

    setupMainProcessNotification$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.SetupMainProcessNotification),
            startWith(OPTIONS_ACTIONS.SetupMainProcessNotification()),
            mergeMap(() => {
                return from(
                    this.ipcMainClient("notification")(),
                ).pipe(
                    mergeMap((value) => {
                        IPC_MAIN_API_NOTIFICATION_ACTIONS.match(
                            value,
                            {
                                ConfigUpdated: (config) => {
                                    this.store.dispatch(OPTIONS_ACTIONS.GetConfigResponse(config));
                                },
                                OpenOptions: () => {
                                    this.coreService.openSettingsView();
                                },
                                LogOut: () => {
                                    this.coreService.logOut();
                                },
                                ErrorMessage: ({message}) => {
                                    this.store.dispatch(NOTIFICATION_ACTIONS.Message({message, style: "error"}));
                                },
                                InfoMessage: ({message}) => {
                                    this.store.dispatch(NOTIFICATION_ACTIONS.Message({message, style: "info"}));
                                },
                                TrayIconDataURL: (payload) => {
                                    this.store.dispatch(OPTIONS_ACTIONS.TrayIconDataURL({value: payload}));
                                },
                                default() {
                                    // NOOP
                                },
                            },
                        );

                        return of(OPTIONS_ACTIONS.PatchMainProcessNotification(value));
                    }),
                );
            })),
    );

    initRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.InitRequest),
            switchMap(() => {
                return from(this.ipcMainClient("init")()).pipe(
                    mergeMap((payload) => merge(
                        payload.checkUpdateAndNotify
                            ? (
                                timer(ONE_SECOND_MS * 10, ONE_SECOND_MS).pipe(
                                    filter(() => navigator.onLine),
                                    take(1),
                                    mergeMap(() => from(
                                        this.ipcMainClient("updateCheck", {timeoutMs: UPDATE_CHECK_FETCH_TIMEOUT + (ONE_SECOND_MS * 2)})(),
                                    ).pipe(
                                        filter((items) => Boolean(items.length)),
                                        withLatestFrom(
                                            this.store.pipe(
                                                select(OptionsSelectors.FEATURED.trayIconDataURL),
                                            ),
                                        ),
                                        mergeMap(([items, trayIconDataURL]) => {
                                            new Notification(
                                                PRODUCT_NAME,
                                                {
                                                    icon: trayIconDataURL,
                                                    body: "App update is available.",
                                                },
                                            ).onclick = () => {
                                                this.store.dispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                                            };

                                            return of(NOTIFICATION_ACTIONS.Update(items));
                                        }),
                                    )),
                                )
                            )
                            : EMPTY,
                        of(OPTIONS_ACTIONS.InitResponse(payload)),
                        of(this.optionsService.settingsNavigationAction({path: ""})),
                    )),
                );
            }),
        ),
    );

    getConfigRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.GetConfigRequest),
            concatMap(() => {
                return from(
                    this.ipcMainClient("readConfig")(),
                ).pipe(
                    concatMap((config) => [
                        OPTIONS_ACTIONS.GetConfigResponse(config),
                        this.optionsService.settingsNavigationAction({path: ""}),
                    ]),
                );
            })),
    );

    getSettingsRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.GetSettingsRequest),
            withLatestFrom(this.store.pipe(select(OptionsSelectors.FEATURED.settings))),
            concatMap(([, settings]) => {
                if ("_rev" in settings) {
                    return of(this.optionsService.settingsNavigationAction({
                        path: settings.accounts.length ? "" : "account-edit",
                    }));
                }

                return from(
                    this.ipcMainClient("settingsExists")(),
                ).pipe(
                    map((readable) => this.optionsService.settingsNavigationAction({
                        path: readable ? "login" : "settings-setup",
                    })),
                );
            }),
        ),
    );

    resetDbMetadata$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ResetDbMetadata),
            withLatestFrom(
                this.store.pipe(
                    select(AccountsSelectors.FEATURED.accounts),
                ),
            ),
            concatMap(([{payload: {reset}}, accounts]) => {
                // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                const buildFinishNavigationAction = () => this.buildAfterLoginNavigationAction(accounts.length);

                return typeof reset === "boolean"
                    // patching db/config
                    ? merge(
                        of(this.buildPatchProgress({resettingDbMetadata: true})),
                        from(
                            this.ipcMainClient("dbResetDbMetadata")({reset}),
                        ).pipe(
                            concatMap(() => [
                                buildFinishNavigationAction(),
                            ]),
                            finalize(() => this.dispatchProgress({resettingDbMetadata: false})),
                        ),
                    )
                    // just navigating
                    : of(buildFinishNavigationAction());
            }),
        ),
    );

    signInRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.SignInRequest),
            concatMap(({payload, ...action}) => merge(
                of(this.buildPatchProgress({signingIn: true})),
                from(
                    this.ipcMainClient("readSettings")(payload),
                ).pipe(
                    withLatestFrom(
                        this.store.pipe(
                            select(OptionsSelectors.FEATURED.config),
                        ),
                    ),
                    concatMap(([settings, {timeouts: {databaseLoading: databaseLoadingTimeout}, shouldRequestDbMetadataReset}]) => {
                        return merge(
                            of(this.buildPatchProgress({loadingDatabase: true})),
                            from(
                                this.ipcMainClient("loadDatabase", {timeoutMs: databaseLoadingTimeout})({accounts: settings.accounts}),
                            ).pipe(
                                concatMap(() => [
                                    OPTIONS_ACTIONS.GetSettingsResponse(settings),
                                    (() => {
                                        const logger = curryFunctionMembers(_logger, `[${action.type}]`);
                                        const shouldRequestDbMetadataResetInitial = shouldRequestDbMetadataReset === "initial";

                                        logger.info({shouldRequestDbMetadataResetInitial});

                                        if (
                                            shouldRequestDbMetadataResetInitial
                                            &&
                                            // "local store" enabled for at least one account
                                            settings.accounts.some(({database}) => Boolean(database))
                                        ) {
                                            return NAVIGATION_ACTIONS.Go({
                                                path: [{
                                                    outlets: {
                                                        [SETTINGS_OUTLET]: `${SETTINGS_PATH}/db-metadata-reset-request`,
                                                    },
                                                }],
                                            });
                                        }

                                        if (shouldRequestDbMetadataResetInitial) {
                                            // turning the flag to "done" so the logic doesn't take place anymore
                                            return OPTIONS_ACTIONS.ResetDbMetadata({reset: false});
                                        }

                                        return this.buildAfterLoginNavigationAction(settings.accounts.length);
                                    })(),
                                ]),
                                finalize(() => this.dispatchProgress({loadingDatabase: false})),
                            ),
                        );
                    }),
                    catchError((error) => {
                        if (
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            String(error.message)
                                .toLowerCase()
                                .includes("decryption failed")
                        ) {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            error.message = "Failed to decrypt the settings storage";
                        }
                        return of(NOTIFICATION_ACTIONS.Error(error));
                    }),
                    finalize(() => this.dispatchProgress({signingIn: false})),
                ),
            ))),
    );

    addAccountRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.AddAccountRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({addingAccount: true})),
                from(
                    this.ipcMainClient("addAccount")(payload),
                ).pipe(
                    concatMap((settings) => [
                        OPTIONS_ACTIONS.GetSettingsResponse(settings),
                        this.optionsService.settingsNavigationAction({
                            path: "account-edit",
                            queryParams: {login: payload.login},
                        }),
                    ]),
                    finalize(() => this.dispatchProgress({addingAccount: false})),
                ),
            ))),
    );

    updateAccountRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.UpdateAccountRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({updatingAccount: true})),
                from(
                    this.ipcMainClient("updateAccount")(payload),
                ).pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    finalize(() => this.dispatchProgress({updatingAccount: false})),
                ),
            ))),
    );

    changeAccountOrderRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ChangeAccountOrderRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({changingAccountOrder: true})),
                from(
                    this.ipcMainClient("changeAccountOrder", {timeoutMs: ONE_SECOND_MS * 20})(payload),
                ).pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    finalize(() => this.dispatchProgress({changingAccountOrder: false})),
                ),
            ))),
    );

    toggleAccountDisabling$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ToggleAccountDisablingRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({togglingAccountDisabling: true})),
                from(
                    this.ipcMainClient("toggleAccountDisabling", {timeoutMs: ONE_SECOND_MS * 20})(payload),
                ).pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    finalize(() => this.dispatchProgress({togglingAccountDisabling: false})),
                ),
            ))),
    );

    removeAccountRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.RemoveAccountRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({removingAccount: true})),
                from(
                    this.ipcMainClient("removeAccount")({login: payload.login}),
                ).pipe(
                    concatMap((settings) => [
                        OPTIONS_ACTIONS.GetSettingsResponse(settings),
                        this.optionsService.settingsNavigationAction({path: "accounts"}),
                    ]),
                    finalize(() => this.dispatchProgress({removingAccount: false})),
                ),
            ))),
    );

    changeMasterPasswordRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ChangeMasterPasswordRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({changingPassword: true})),
                from(
                    this.ipcMainClient("changeMasterPassword")(payload),
                ).pipe(
                    concatMap(() => EMPTY),
                    catchError((error) => {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        error.message = "Failed to change the master password! " +
                            "Please make sure that correct current password has been entered.";
                        return of(NOTIFICATION_ACTIONS.Error(error));
                    }),
                    finalize(() => this.dispatchProgress({changingPassword: false})),
                ),
            ))),
    );

    updateBaseSettings$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.PatchBaseSettingsRequest),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({updatingBaseSettings: true})),
                from(
                    this.ipcMainClient("patchBaseConfig")(payload),
                ).pipe(
                    map((config) => OPTIONS_ACTIONS.GetConfigResponse(config)),
                    finalize(() => this.dispatchProgress({updatingBaseSettings: false})),
                ),
            ))),
    );

    reEncryptingSettings$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ReEncryptSettings),
            concatMap(({payload}) => {
                const {encryptionPreset, password} = payload;

                return merge(
                    of(this.buildPatchProgress({reEncryptingSettings: true})),
                    from(
                        this.ipcMainClient("reEncryptSettings")({encryptionPreset, password}),
                    ).pipe(
                        map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                        finalize(() => this.dispatchProgress({reEncryptingSettings: false})),
                    ),
                );
            })),
    );

    constructor(
        private optionsService: OptionsService,
        private coreService: CoreService,
        private api: ElectronService,
        private store: Store<State>,
        private ngZone: NgZone,
        private actions$: Actions<{
            type: string;
            payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        }>,
    ) {
        store.dispatch = ((dispatch) => {
            const result: typeof store.dispatch = (...args) => {
                return this.ngZone.run(() => dispatch(...args));
            };
            return result;
        })(store.dispatch.bind(store));
    }

    private buildAfterLoginNavigationAction(accountCount: number): ReturnType<typeof NAVIGATION_ACTIONS.Go> {
        return NAVIGATION_ACTIONS.Go({
            path: [{
                outlets: {
                    [SETTINGS_OUTLET]: accountCount ? null : `${SETTINGS_PATH}/account-edit`,
                    [ACCOUNTS_OUTLET]: ACCOUNTS_PATH,
                },
            }]
        });
    }

    private buildPatchProgress(patch: ProgressPatch): ReturnType<typeof OPTIONS_ACTIONS.PatchProgress> {
        return OPTIONS_ACTIONS.PatchProgress(patch);
    }

    private dispatchProgress(patch: ProgressPatch): void {
        this.store.dispatch(this.buildPatchProgress(patch));
    }
}
