import {catchError, finalize, map, mergeMap, switchMap, withLatestFrom} from "rxjs/operators";
import {of} from "rxjs/observable/of";
import {merge as observableMerge} from "rxjs/observable/merge";
import {Injectable} from "@angular/core";
import {Actions, Effect} from "@ngrx/effects";
import {Store} from "@ngrx/store";

import {ACCOUNTS_OUTLET, ACCOUNTS_PATH, SETTINGS_OUTLET, SETTINGS_PATH} from "_web_app/app.constants";
import {ProgressPatch, settingsSelector, State} from "_web_app/store/reducers/options";
import {NavigationActions, OptionsActions} from "_web_app/store/actions";
import {IpcMainActions} from "_shared/electron-actions";
import {ElectronService} from "../+core/electron.service";
import {EffectsService} from "../+core/effects.service";
import {OptionsService} from "./options.service";

@Injectable()
export class OptionsEffects {
    @Effect()
    initRequest$ = this.actions$
        .ofType(OptionsActions.InitRequest.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain<IpcMainActions.Init.Type>(IpcMainActions.Init.channel)
            .pipe(
                mergeMap((payload) => [
                    new OptionsActions.InitResponse(payload),
                    this.optionsService.buildNavigationAction({path: ""}),
                ]),
                catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
            ),
        ));

    @Effect()
    getConfigRequest$ = this.actions$
        .ofType(OptionsActions.GetConfigRequest.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain<IpcMainActions.ReadConfig.Type>(IpcMainActions.ReadConfig.channel)
            .pipe(
                mergeMap((config) => [
                    new OptionsActions.GetConfigResponse(config),
                    this.optionsService.buildNavigationAction({path: ""}),
                ]),
                catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
            ),
        ));

    @Effect()
    getSettingsRequest$ = this.actions$
        .ofType(OptionsActions.GetSettingsRequest.type)
        .pipe(
            withLatestFrom(this.store.select(settingsSelector)),
            switchMap(([action, settings]) => {
                if ("_rev" in settings) {
                    return of(this.optionsService.buildNavigationAction({
                        path: settings.accounts.length ? "" : "account-edit",
                    }));
                }

                return this.electronService
                    .callIpcMain<IpcMainActions.SettingsExists.Type>(IpcMainActions.SettingsExists.channel)
                    .pipe(
                        map((readable) => this.optionsService.buildNavigationAction({
                            path: readable ? "login" : "settings-setup",
                        })),
                        catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
                    );
            }),
        );

    @Effect()
    getSettingsAutoRequest$ = this.actions$
        .ofType(OptionsActions.GetSettingsAutoRequest.type)
        .pipe(switchMap(() => observableMerge(
            of(this.buildPatchProgress({signingIn: true})),
            this.electronService
                .callIpcMain<IpcMainActions.ReadSettingsAuto.Type>(IpcMainActions.ReadSettingsAuto.channel)
                .pipe(
                    mergeMap((settings) => settings
                        ? [
                            new OptionsActions.GetSettingsResponse(settings),
                            new NavigationActions.Go({
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
    signInRequest$ = this.actions$
        .ofType<OptionsActions.SignInRequest>(OptionsActions.SignInRequest.type)
        .pipe(switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({signingIn: true})),
            this.electronService
                .callIpcMain<IpcMainActions.ReadSettings.Type>(IpcMainActions.ReadSettings.channel, payload)
                .pipe(
                    mergeMap((settings) => [
                        new OptionsActions.GetSettingsResponse(settings),
                        new NavigationActions.Go({
                            path: [{
                                outlets: {
                                    [SETTINGS_OUTLET]: settings.accounts.length ? null : `${SETTINGS_PATH}/account-edit`,
                                    [ACCOUNTS_OUTLET]: ACCOUNTS_PATH,
                                },
                            }],
                        })]),
                    catchError((error) => {
                        error.message = "Failed to log in";
                        return this.effectsService.buildFailActionObservable(error);
                    }),
                    finalize(() => this.dispatchProgress({signingIn: false})),
                ),
        )));

    @Effect()
    addAccountRequest$ = this.actions$
        .ofType<OptionsActions.AddAccountRequest>(OptionsActions.AddAccountRequest.type)
        .pipe(switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({addingAccount: true})),
            this.electronService
                .callIpcMain<IpcMainActions.AddAccount.Type>(IpcMainActions.AddAccount.channel, payload)
                .pipe(
                    mergeMap((settings) => [
                        new OptionsActions.GetSettingsResponse(settings),
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
    updateAccountRequest$ = this.actions$
        .ofType<OptionsActions.UpdateAccountRequest>(OptionsActions.UpdateAccountRequest.type)
        .pipe(switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({updatingAccount: true})),
            this.electronService
                .callIpcMain<IpcMainActions.UpdateAccount.Type>(IpcMainActions.UpdateAccount.channel, payload)
                .pipe(
                    map((settings) => new OptionsActions.GetSettingsResponse(settings)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({updatingAccount: false})),
                ),
        )));

    @Effect()
    removeAccountRequest$ = this.actions$
        .ofType<OptionsActions.RemoveAccountRequest>(OptionsActions.RemoveAccountRequest.type)
        .pipe(switchMap(({login}) => observableMerge(
            of(this.buildPatchProgress({removingAccount: true})),
            this.electronService
                .callIpcMain<IpcMainActions.RemoveAccount.Type>(IpcMainActions.RemoveAccount.channel, {login})
                .pipe(
                    map((settings) => new OptionsActions.GetSettingsResponse(settings)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({removingAccount: false})),
                ),
        )));

    @Effect()
    changeMasterPasswordRequest$ = this.actions$
        .ofType<OptionsActions.ChangeMasterPasswordRequest>(OptionsActions.ChangeMasterPasswordRequest.type)
        .pipe(switchMap(({passwordChangeContainer}) => observableMerge(
            of(this.buildPatchProgress({changingPassword: true})),
            this.electronService
                .callIpcMain<IpcMainActions.ChangeMasterPassword.Type>(
                    IpcMainActions.ChangeMasterPassword.channel, passwordChangeContainer,
                )
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
    associateSettingsWithKeePassRequest$ = this.actions$
        .ofType<OptionsActions.AssociateSettingsWithKeePassRequest>(OptionsActions.AssociateSettingsWithKeePassRequest.type)
        .pipe(switchMap(({payload}) => observableMerge(
            of(this.buildPatchProgress({keePassReferencing: true})),
            this.electronService
                .callIpcMain<IpcMainActions.AssociateSettingsWithKeePass.Type>(
                    IpcMainActions.AssociateSettingsWithKeePass.channel, payload,
                )
                .pipe(
                    map((settings) => new OptionsActions.GetSettingsResponse(settings)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({keePassReferencing: false})),
                ),
        )));

    @Effect()
    toggleCompactLayout$ = this.actions$
        .ofType(OptionsActions.ToggleCompactRequest.type)
        .pipe(switchMap(() => observableMerge(
            of(this.buildPatchProgress({togglingCompactLayout: true})),
            this.electronService
                .callIpcMain<IpcMainActions.ToggleCompactLayout.Type>(IpcMainActions.ToggleCompactLayout.channel)
                .pipe(
                    map((config) => new OptionsActions.GetConfigResponse(config)),
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                    finalize(() => this.dispatchProgress({togglingCompactLayout: false})),
                ),
        )));

    constructor(private effectsService: EffectsService,
                private optionsService: OptionsService,
                private electronService: ElectronService,
                private store: Store<State>,
                private actions$: Actions) {
    }

    private buildPatchProgress(patch: ProgressPatch) {
        return new OptionsActions.PatchProgress(patch);
    }

    private dispatchProgress(patch: ProgressPatch) {
        this.store.dispatch(this.buildPatchProgress(patch));
    }
}
