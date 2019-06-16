import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from, of} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Location} from "@angular/common";
import {Router} from "@angular/router";
import {catchError, concatMap, map, mergeMap, tap} from "rxjs/operators";

import {ElectronService} from "./electron.service";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[navigation.effects.ts]");

@Injectable()
export class NavigationEffects {
    navigate$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Go),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            tap(({payload, logger}) => {
                const {path, extras, queryParams} = payload;

                // WARN: privacy note, do not log "queryParams" as it might be filled with sensitive data (like "login"/"user name")
                logger.verbose(JSON.stringify({path, extras}));

                this.ngZone.run(async () => {
                    // tslint:disable-next-line:no-floating-promises
                    await this.router.navigate(path, {queryParams, ...extras});
                });
            }),
            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
        ),
        {dispatch: false},
    );

    navigateBack$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Back),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            tap(() => this.location.back()),
            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
        ),
        {dispatch: false},
    );

    navigateForward$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Forward),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            tap(() => this.location.forward()),
            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
        ),
        {dispatch: false},
    );

    toggleBrowserWindow$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.ToggleBrowserWindow),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => from(this.electronService.ipcMainClient()("toggleBrowserWindow")(payload)).pipe(
                mergeMap(() => EMPTY),
                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
            ))),
    );

    openAboutWindow$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenAboutWindow),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => from(this.electronService.ipcMainClient()("openAboutWindow")()).pipe(
                mergeMap(() => EMPTY),
                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
            ))),
    );

    openExternal$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenExternal),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => from(this.electronService.ipcMainClient()("openExternal")({url: payload.url})).pipe(
                mergeMap(() => EMPTY),
                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
            )),
        ),
    );

    openSettingsFolder$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenSettingsFolder),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => from(this.electronService.ipcMainClient()("openSettingsFolder")()).pipe(
                mergeMap(() => EMPTY),
                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
            ))),
    );

    logout$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Logout),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => {
                return from(this.electronService.ipcMainClient()("logout")()).pipe(
                    concatMap(() => {
                        setTimeout(() => window.location.reload(), 0);
                        return EMPTY;
                    }),
                    catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                );
            }),
        ),
    );

    quit$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Quit),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => from(this.electronService.ipcMainClient()("quit")()).pipe(
                mergeMap(() => EMPTY),
                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
            ))),
    );

    constructor(
        private electronService: ElectronService,
        private actions$: Actions<{ type: string; payload: any }>,
        private router: Router,
        private location: Location,
        private ngZone: NgZone,
    ) {}
}
