import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from, merge, of, timer} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {catchError, concatMap, filter, finalize, map, mergeMap, startWith, switchMap, take, withLatestFrom} from "rxjs/operators";
import {subscribableLikeToObservable} from "electron-rpc-api";

import {ACCOUNTS_OUTLET, ACCOUNTS_PATH, SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS, OPTIONS_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {ONE_SECOND_MS, PRODUCT_NAME, UPDATE_CHECK_FETCH_TIMEOUT} from "src/shared/constants";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {OptionsService} from "src/web/browser-window/app/_options/options.service";
import {ProgressPatch, State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";

const _logger = getZoneNameBoundWebLogger("[options.effects]");

@Injectable()
export class OptionsEffects {
    ipcMainClient = this.api.ipcMainClient();

    setupMainProcessNotification$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.SetupMainProcessNotification),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            startWith(OPTIONS_ACTIONS.SetupMainProcessNotification()),
            mergeMap(() => {
                return subscribableLikeToObservable(
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
                                    this.store.dispatch(NOTIFICATION_ACTIONS.ErrorMessage({message}));
                                },
                                InfoMessage: ({message}) => {
                                    this.store.dispatch(NOTIFICATION_ACTIONS.Info({message}));
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
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                );
            })),
    );

    initRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.InitRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
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
                ).pipe(
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                );
            }),
        ),
    );

    getConfigRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.GetConfigRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => {
                return from(
                    this.ipcMainClient("readConfig")(),
                ).pipe(
                    concatMap((config) => [
                        OPTIONS_ACTIONS.GetConfigResponse(config),
                        this.optionsService.settingsNavigationAction({path: ""}),
                    ]),
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                );
            })),
    );

    getSettingsRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.GetSettingsRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
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
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                );
            }),
        ),
    );

    signInRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.SignInRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({signingIn: true})),
                from(
                    this.ipcMainClient("readSettings")(payload),
                ).pipe(
                    withLatestFrom(this.store.pipe(
                        select(OptionsSelectors.FEATURED.config),
                        map((config) => config.timeouts),
                    )),
                    concatMap(([settings, timeouts]) => merge(
                        of(this.buildPatchProgress({loadingDatabase: true})),
                        from(
                            this.ipcMainClient("loadDatabase", {timeoutMs: timeouts.databaseLoading})({accounts: settings.accounts}),
                        ).pipe(
                            concatMap(() => [
                                OPTIONS_ACTIONS.GetSettingsResponse(settings),
                                NAVIGATION_ACTIONS.Go({
                                    path: [{
                                        outlets: {
                                            [SETTINGS_OUTLET]: settings.accounts.length ? null : `${SETTINGS_PATH}/account-edit`,
                                            [ACCOUNTS_OUTLET]: ACCOUNTS_PATH,
                                        },
                                    }],
                                }),
                            ]),
                            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                            finalize(() => this.dispatchProgress({loadingDatabase: false})),
                        ),
                    )),
                    catchError((error) => {
                        if (
                            String(error.message)
                                .toLowerCase()
                                .includes("decryption failed")
                        ) {
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
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
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
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                    finalize(() => this.dispatchProgress({addingAccount: false})),
                ),
            ))),
    );

    updateAccountRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.UpdateAccountRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({updatingAccount: true})),
                from(
                    this.ipcMainClient("updateAccount")(payload),
                ).pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                    finalize(() => this.dispatchProgress({updatingAccount: false})),
                ),
            ))),
    );

    changeAccountOrderRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ChangeAccountOrderRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({changingAccountOrder: true})),
                from(
                    this.ipcMainClient("changeAccountOrder", {timeoutMs: ONE_SECOND_MS * 20})(payload),
                ).pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                    finalize(() => this.dispatchProgress({changingAccountOrder: false})),
                ),
            ))),
    );

    removeAccountRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.RemoveAccountRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({removingAccount: true})),
                from(
                    this.ipcMainClient("removeAccount")({login: payload.login}),
                ).pipe(
                    concatMap((settings) => [
                        OPTIONS_ACTIONS.GetSettingsResponse(settings),
                        this.optionsService.settingsNavigationAction({path: "accounts"}),
                    ]), catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                    finalize(() => this.dispatchProgress({removingAccount: false})),
                ),
            ))),
    );

    changeMasterPasswordRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ChangeMasterPasswordRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({changingPassword: true})),
                from(
                    this.ipcMainClient("changeMasterPassword")(payload),
                ).pipe(
                    concatMap(() => EMPTY),
                    catchError((error) => {
                        error.message = "Failed to change the master password! " +
                            "Please make sure that correct current password has been entered.";
                        return of(NOTIFICATION_ACTIONS.Error(error));
                    }),
                    finalize(() => this.dispatchProgress({changingPassword: false})),
                ),
            ))),
    );

    toggleCompactLayout$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ToggleCompactRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => merge(
                of(this.buildPatchProgress({togglingCompactLayout: true})),
                from(
                    this.ipcMainClient("toggleCompactLayout")(),
                ).pipe(
                    map((config) => OPTIONS_ACTIONS.GetConfigResponse(config)),
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                    finalize(() => this.dispatchProgress({togglingCompactLayout: false})),
                ),
            ))),
    );

    updateBaseSettings$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.PatchBaseSettingsRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => merge(
                of(this.buildPatchProgress({updatingBaseSettings: true})),
                from(
                    this.ipcMainClient("patchBaseConfig")(payload),
                ).pipe(
                    map((config) => OPTIONS_ACTIONS.GetConfigResponse(config)),
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                    finalize(() => this.dispatchProgress({updatingBaseSettings: false})),
                ),
            ))),
    );

    reEncryptingSettings$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ReEncryptSettings),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => {
                const {encryptionPreset, password} = payload;

                return merge(
                    of(this.buildPatchProgress({reEncryptingSettings: true})),
                    from(
                        this.ipcMainClient("reEncryptSettings")({encryptionPreset, password}),
                    ).pipe(
                        map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                        catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
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
        private actions$: Actions<{ type: string; payload: any }>,
    ) {
        store.dispatch = ((dispatch) => {
            const result: typeof store.dispatch = (...args) => {
                return this.ngZone.run(() => dispatch(...args));
            };
            return result;
        })(store.dispatch.bind(store));
    }

    private buildPatchProgress(patch: ProgressPatch) {
        return OPTIONS_ACTIONS.PatchProgress(patch);
    }

    private dispatchProgress(patch: ProgressPatch) {
        this.store.dispatch(this.buildPatchProgress(patch));
    }
}
