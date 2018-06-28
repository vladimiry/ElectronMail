import {catchError, filter, finalize, map, mergeMap, switchMap, withLatestFrom} from "rxjs/operators";
import {merge as observableMerge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {Actions, Effect} from "@ngrx/effects";
import {Store} from "@ngrx/store";

import {ACCOUNTS_OUTLET, ACCOUNTS_PATH, SETTINGS_OUTLET, SETTINGS_PATH} from "_@web/src/app/app.constants";
import {ProgressPatch, settingsSelector, State} from "_@web/src/app/store/reducers/options";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "_@web/src/app/store/actions";
import {ElectronService} from "../+core/electron.service";
import {EffectsService} from "../+core/effects.service";
import {OptionsService} from "./options.service";

@Injectable()
export class OptionsEffects {
    @Effect()
    initRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.InitRequest),
        switchMap(() => this.electronService
            .callIpcMain("init")()
            .pipe(
                mergeMap((payload) => [
                    OPTIONS_ACTIONS.InitResponse(payload),
                    this.optionsService.buildNavigationAction({path: ""}),
                ]),
                catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
            ),
        ));

    @Effect()
    getConfigRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.GetConfigRequest),
        switchMap(() => this.electronService
            .callIpcMain("readConfig")()
            .pipe(
                mergeMap((config) => [
                    OPTIONS_ACTIONS.GetConfigResponse(config),
                    this.optionsService.buildNavigationAction({path: ""}),
                ]),
                catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
            ),
        ));

    @Effect()
    getSettingsRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.GetSettingsRequest),
        withLatestFrom(this.store.select(settingsSelector)),
        switchMap(([action, settings]) => {
            if ("_rev" in settings) {
                return of(this.optionsService.buildNavigationAction({
                    path: settings.accounts.length ? "" : "account-edit",
                }));
            }

            return this.electronService
                .callIpcMain("settingsExists")()
                .pipe(
                    map((readable) => this.optionsService.buildNavigationAction({
                        path: readable ? "login" : "settings-setup",
                    })),
                    catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
                );
        }),
    );

    @Effect()
    getSettingsAutoRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.GetSettingsAutoRequest),
        switchMap(() => observableMerge(
            of(this.buildPatchProgress({signingIn: true})),
            this.electronService
                .callIpcMain("readSettingsAuto")()
                .pipe(
                    mergeMap((settings) => settings
                        ? [
                            OPTIONS_ACTIONS.GetSettingsResponse(settings),
                            NAVIGATION_ACTIONS.Go({
                                path: [{
                                    outlets: {
                                        [SETTINGS_OUTLET]: settings.accounts.length ? null : `${SETTINGS_PATH}/account-edit`,
                                        [ACCOUNTS_OUTLET]: ACCOUNTS_PATH,
                                    },
                                }],
                            }),
                        ]
                        : [],
                    ),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({signingIn: false})),
                ),
        )));

    @Effect()
    signInRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.SignInRequest),
        switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({signingIn: true})),
            this.electronService
                .callIpcMain("readSettings")(payload)
                .pipe(
                    mergeMap((settings) => [
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
                    catchError((error) => {
                        error.message = "Failed to log in";
                        return this.effectsService.buildFailActionObservable(error);
                    }),
                    finalize(() => this.dispatchProgress({signingIn: false})),
                ),
        )));

    @Effect()
    addAccountRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.AddAccountRequest),
        switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({addingAccount: true})),
            this.electronService
                .callIpcMain("addAccount")(payload)
                .pipe(
                    mergeMap((settings) => [
                        OPTIONS_ACTIONS.GetSettingsResponse(settings),
                        this.optionsService.buildNavigationAction({
                            path: "account-edit",
                            queryParams: {login: payload.login},
                        }),
                    ]),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({addingAccount: false})),
                ),
        )));

    @Effect()
    updateAccountRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.UpdateAccountRequest),
        switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({updatingAccount: true})),
            this.electronService
                .callIpcMain("updateAccount")(payload)
                .pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({updatingAccount: false})),
                ),
        )));

    @Effect()
    removeAccountRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.RemoveAccountRequest),
        switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({removingAccount: true})),
            this.electronService
                .callIpcMain("removeAccount")({login: payload.login})
                .pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({removingAccount: false})),
                ),
        )));

    @Effect()
    changeMasterPasswordRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.ChangeMasterPasswordRequest),
        switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({changingPassword: true})),
            this.electronService
                .callIpcMain("changeMasterPassword")(payload)
                .pipe(
                    mergeMap(() => []),
                    catchError((error) => {
                        error.message = "Failed to change the master password! " +
                            "Please make sure that correct current password has been entered.";
                        return this.effectsService.buildFailActionObservable(error);
                    }),
                    finalize(() => this.dispatchProgress({changingPassword: false})),
                ),
        )));

    @Effect()
    associateSettingsWithKeePassRequest$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.AssociateSettingsWithKeePassRequest),
        switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({keePassReferencing: true})),
            this.electronService
                .callIpcMain("associateSettingsWithKeePass")(payload)
                .pipe(
                    map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({keePassReferencing: false})),
                ),
        )));

    @Effect()
    toggleCompactLayout$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.ToggleCompactRequest),
        switchMap(() => observableMerge(
            of(this.buildPatchProgress({togglingCompactLayout: true})),
            this.electronService
                .callIpcMain("toggleCompactLayout")()
                .pipe(
                    map((config) => OPTIONS_ACTIONS.GetConfigResponse(config)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({togglingCompactLayout: false})),
                ),
        )));

    @Effect()
    updateBaseSettings$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.PatchBaseSettingsRequest),
        switchMap((patch) => observableMerge(
            of(this.buildPatchProgress({updatingBaseSettings: true})),
            this.electronService
                .callIpcMain("patchBaseSettings")(patch)
                .pipe(
                    map((config) => OPTIONS_ACTIONS.GetConfigResponse(config)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({updatingBaseSettings: false})),
                ),
        )));

    @Effect()
    reEncryptingSettings$ = this.actions$.pipe(
        filter(OPTIONS_ACTIONS.is.ReEncryptSettings),
        switchMap(({payload}) => {
            const {encryptionPreset, password} = payload;

            return observableMerge(
                of(this.buildPatchProgress({reEncryptingSettings: true})),
                this.electronService
                    .callIpcMain("reEncryptSettings")({encryptionPreset, password})
                    .pipe(
                        map((settings) => OPTIONS_ACTIONS.GetSettingsResponse(settings)),
                        catchError((error) => this.effectsService.buildFailActionObservable(error)),
                        finalize(() => this.dispatchProgress({reEncryptingSettings: false})),
                    ),
            );
        }));

    constructor(private effectsService: EffectsService,
                private optionsService: OptionsService,
                private electronService: ElectronService,
                private store: Store<State>,
                private actions$: Actions) {}

    private buildPatchProgress(patch: ProgressPatch) {
        return OPTIONS_ACTIONS.PatchProgress(patch);
    }

    private dispatchProgress(patch: ProgressPatch) {
        this.store.dispatch(this.buildPatchProgress(patch));
    }
}
