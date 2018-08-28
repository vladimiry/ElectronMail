import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, concat, of} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Location} from "@angular/common";
import {Router} from "@angular/router";
import {catchError, concatMap, filter, map, mergeMap, tap} from "rxjs/operators";

import {ACCOUNTS_OUTLET, SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/src/app/app.constants";
import {CORE_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "./electron.service";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[navigation.effects.ts]");

@Injectable()
export class NavigationEffects {
    @Effect({dispatch: false})
    navigate$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.Go),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        map(({payload, logger}) => {
            const {path, extras} = payload;
            // WARN: privacy note, do not log "queryParams" as it might be filled with sensitive data (like "login"/"user name")
            logger.verbose(JSON.stringify({path, extras}));
            return payload;
        }),
        tap(({path, queryParams, extras}) => {
            // TODO remove "zone.run" execution on https://github.com/angular/angular/issues/18254 resolving
            // or use @angular/router v4.1.3 and older
            this.zone.run(async () => {
                // tslint:disable-next-line:no-floating-promises
                await this.router.navigate(path, {queryParams, ...extras});
            });
        }),
        catchError((error) => of(CORE_ACTIONS.Fail(error))),
    );

    @Effect({dispatch: false})
    navigateBack$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.Back),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        tap(() => this.location.back()),
        catchError((error) => of(CORE_ACTIONS.Fail(error))),
    );

    @Effect({dispatch: false})
    navigateForward$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.Forward),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        tap(() => this.location.forward()),
        catchError((error) => of(CORE_ACTIONS.Fail(error))),
    );

    @Effect()
    toggleBrowserWindow$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.ToggleBrowserWindow),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload}) => this.electronService.ipcMainClient()("toggleBrowserWindow")(payload).pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    openAboutWindow$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.OpenAboutWindow),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => this.electronService.ipcMainClient()("openAboutWindow")().pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    openExternal$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.OpenExternal),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload}) => this.electronService.ipcMainClient()("openExternal")({url: payload.url}).pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    openSettingsFolder$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.OpenSettingsFolder),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => this.electronService.ipcMainClient()("openSettingsFolder")().pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    logout$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.Logout),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => {
            const concatenated = concat(
                this.electronService.ipcMainClient()("logout")().pipe(
                    mergeMap(() => EMPTY),
                ),
                of(NAVIGATION_ACTIONS.Go({
                    path: [{
                        outlets: {
                            [ACCOUNTS_OUTLET]: null,
                            [SETTINGS_OUTLET]: SETTINGS_PATH,
                        },
                    }],
                })),
                of(CORE_ACTIONS.UpdateOverlayIcon({hasLoggedOut: false, unread: 0})),
            );

            return concatenated.pipe(
                catchError((error) => of(CORE_ACTIONS.Fail(error))),
            );
        }),
    );

    @Effect()
    quit$ = this.actions$.pipe(
        filter(NAVIGATION_ACTIONS.is.Quit),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => this.electronService.ipcMainClient()("quit")().pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    constructor(private electronService: ElectronService,
                private actions$: Actions,
                private router: Router,
                private location: Location,
                private zone: NgZone) {}
}
