import {Actions, Effect} from "@ngrx/effects";
import {catchError, map, switchMap, tap} from "rxjs/operators";
import {concat, of} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Location} from "@angular/common";
import {Router} from "@angular/router";

import {ACCOUNTS_OUTLET, SETTINGS_OUTLET, SETTINGS_PATH} from "_web_src/app/app.constants";
import {NavigationActions} from "_web_src/app/store/actions";
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
            .callIpcMain("toggleBrowserWindow")(payload)
            .pipe(
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    openAboutWindow$ = this.actions$
        .ofType(NavigationActions.OpenAboutWindow.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain("openAboutWindow")()
            .pipe(
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    openExternal$ = this.actions$
        .ofType<NavigationActions.OpenExternal>(NavigationActions.OpenExternal.type)
        .pipe(switchMap(({url}) => this.electronService
            .callIpcMain("openExternal")({url})
            .pipe(
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    openSettingsFolder$ = this.actions$
        .ofType(NavigationActions.OpenSettingsFolder.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain("openSettingsFolder")()
            .pipe(
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    @Effect()
    logout$ = this.actions$
        .ofType(NavigationActions.Logout.type)
        .pipe(
            switchMap(() => {
                const concatenated = concat(
                    this.electronService.callIpcMain("logout")(),
                    of(new NavigationActions.Go({
                        path: [{
                            outlets: {
                                [ACCOUNTS_OUTLET]: null,
                                [SETTINGS_OUTLET]: SETTINGS_PATH,
                            },
                        }],
                    })),
                );

                return concatenated.pipe(
                    catchError((error) => this.effectsService.buildFailActionObservable(error)),
                );
            }),
        );

    @Effect()
    quit$ = this.actions$
        .ofType(NavigationActions.Quit.type)
        .pipe(switchMap(() => this.electronService
            .callIpcMain("quit")()
            .pipe(
                catchError((error) => this.effectsService.buildFailActionObservable(error)),
            )));

    constructor(private effectsService: EffectsService,
                private electronService: ElectronService,
                private actions$: Actions,
                private router: Router,
                private location: Location,
                private zone: NgZone) {}
}
