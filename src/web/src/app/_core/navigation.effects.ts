import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, from, of} from "rxjs";
import {Injectable} from "@angular/core";
import {Location} from "@angular/common";
import {Router} from "@angular/router";
import {catchError, concatMap, map, mergeMap, switchMap, tap} from "rxjs/operators";

import {CORE_ACTIONS, NAVIGATION_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {ElectronService} from "./electron.service";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[navigation.effects.ts]");

@Injectable()
export class NavigationEffects {
    @Effect({dispatch: false})
    navigate$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.Go),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        switchMap(({payload, logger}) => { // tslint:disable-line:ban
            const {path, extras, queryParams} = payload;

            // WARN: privacy note, do not log "queryParams" as it might be filled with sensitive data (like "login"/"user name")
            logger.verbose(JSON.stringify({path, extras}));

            return from(this.router.navigate(path, {queryParams, ...extras})).pipe(
                mergeMap(() => EMPTY),
            );
        }),
        catchError((error) => of(CORE_ACTIONS.Fail(error))),
    );

    @Effect({dispatch: false})
    navigateBack$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.Back),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        tap(() => this.location.back()),
        catchError((error) => of(CORE_ACTIONS.Fail(error))),
    );

    @Effect({dispatch: false})
    navigateForward$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.Forward),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        tap(() => this.location.forward()),
        catchError((error) => of(CORE_ACTIONS.Fail(error))),
    );

    @Effect()
    toggleBrowserWindow$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.ToggleBrowserWindow),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload}) => this.electronService.ipcMainClient()("toggleBrowserWindow")(payload).pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    openAboutWindow$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenAboutWindow),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => this.electronService.ipcMainClient()("openAboutWindow")().pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    openExternal$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenExternal),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload}) => this.electronService.ipcMainClient()("openExternal")({url: payload.url}).pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    openSettingsFolder$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenSettingsFolder),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => this.electronService.ipcMainClient()("openSettingsFolder")().pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    @Effect()
    logout$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.Logout),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => {
            return this.electronService.ipcMainClient()("logout")().pipe(
                concatMap(() => {
                    setTimeout(() => window.location.reload(), 0);
                    return EMPTY;
                }),
                catchError((error) => of(CORE_ACTIONS.Fail(error))),
            );
        }),
    );

    @Effect()
    quit$ = this.actions$.pipe(
        unionizeActionFilter(NAVIGATION_ACTIONS.is.Quit),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(() => this.electronService.ipcMainClient()("quit")().pipe(
            mergeMap(() => EMPTY),
            catchError((error) => of(CORE_ACTIONS.Fail(error))),
        )));

    constructor(
        private electronService: ElectronService,
        private actions$: Actions<{ type: string; payload: any }>,
        private router: Router,
        private location: Location,
    ) {}
}
