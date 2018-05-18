import {catchError, map, mergeMap, switchMap, tap} from "rxjs/operators";
import {Injectable, NgZone} from "@angular/core";
import {Router} from "@angular/router";
import {Location} from "@angular/common";
import {Actions, Effect} from "@ngrx/effects";

import {IpcMainActions} from "_shared/electron-actions";
import {ACCOUNTS_OUTLET, SETTINGS_OUTLET, SETTINGS_PATH} from "_web_app/app.constants";
import {NavigationActions} from "_web_app/store/actions";
import {ElectronService} from "./electron.service";
import {EffectsService} from "./effects.service";

@Injectable()
export class NavigationEffects {
    @Effect({dispatch: false})
    navigate$ = this.actions$
        .ofType<NavigationActions.Go>(NavigationActions.Go.type)
        .pipe(
            map((action) => action.payload),
            tap(({path, queryParams, extras}) => {
                // TODO remove "zone.run" execution on https://github.com/angular/angular/issues/18254 resolving
                // or use @angular/router v4.1.3 and older
                this.zone.run(async () => {
                    // tslint:disable-next-line:no-floating-promises
                    await this.router.navigate(path, {queryParams, ...extras});
                });
            }),
            catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
        );

    @Effect({dispatch: false})
    navigateBack$ = this.actions$
        .ofType(NavigationActions.Back.type)
        .pipe(
            tap(() => this.location.back()),
            catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
        );

    @Effect({dispatch: false})
    navigateForward$ = this.actions$
        .ofType(NavigationActions.Forward.type)
        .pipe(
            tap(() => this.location.forward()),
            catchError(this.effectsService.buildFailActionObservable.bind(this.effectsService)),
        );

    @Effect()
    toggleBrowserWindow$ = this.actions$
        .ofType<NavigationActions.ToggleBrowserWindow>(NavigationActions.ToggleBrowserWindow.type)
        .pipe(switchMap(({payload}) => this.electronService
            .callIpcMain<IpcMainActions.ToggleBrowserWindow.Type>(IpcMainActions.ToggleBrowserWindow.channel, payload)
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    openAboutWindow$ = this.actions$
        .ofType(NavigationActions.OpenAboutWindow.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain<IpcMainActions.OpenAboutWindow.Type>(IpcMainActions.OpenAboutWindow.channel)
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    openExternal$ = this.actions$
        .ofType<NavigationActions.OpenExternal>(NavigationActions.OpenExternal.type)
        .pipe(switchMap(({url}) => this.electronService
            .callIpcMain<IpcMainActions.OpenExternal.Type>(IpcMainActions.OpenExternal.channel, {url})
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    openSettingsFolder$ = this.actions$
        .ofType(NavigationActions.OpenSettingsFolder.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain<IpcMainActions.OpenSettingsFolder.Type>(IpcMainActions.OpenSettingsFolder.channel)
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    logout$ = this.actions$
        .ofType(NavigationActions.Logout.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain<IpcMainActions.Logout.Type>(IpcMainActions.Logout.channel)
            .pipe(
                mergeMap(() => [
                    new NavigationActions.Go({
                        path: [{
                            outlets: {
                                [ACCOUNTS_OUTLET]: null,
                                [SETTINGS_OUTLET]: SETTINGS_PATH,
                            },
                        }],
                    }),
                ]),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    quit$ = this.actions$
        .ofType(NavigationActions.Quit.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain<IpcMainActions.Quit.Type>(IpcMainActions.Quit.channel)
            .pipe(
                mergeMap(() => []),
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    constructor(private effectsService: EffectsService,
                private electronService: ElectronService,
                private actions$: Actions,
                private router: Router,
                private location: Location,
                private zone: NgZone) {}
}
