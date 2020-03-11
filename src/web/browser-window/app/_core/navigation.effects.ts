import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Router} from "@angular/router";
import {concatMap, map, mergeMap} from "rxjs/operators";

import {ACCOUNTS_OUTLET, SETTINGS_OUTLET, STUB_OUTLET, STUB_PATH} from "src/web/browser-window/app/app.constants";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NAVIGATION_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";

const _logger = getZoneNameBoundWebLogger("[navigation.effects.ts]");

@Injectable()
export class NavigationEffects {
    go$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Go),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload, logger}) => {
                const {path, extras, queryParams} = payload;
                // WARN privacy note: do not log "queryParams"
                // since it might be filled with sensitive data (like "login"/"user name")
                logger.verbose(JSON.stringify({path, extras}));
                return from(
                    this.ngZone.run(async () => {
                        return await this.router.navigate(path, {queryParams, ...extras});
                    }),
                );
            }),
            concatMap(() => EMPTY),
        ),
        {dispatch: false},
    );

    toggleBrowserWindow$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.ToggleBrowserWindow),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => from(this.electronService.ipcMainClient()("toggleBrowserWindow")(payload)).pipe(
                mergeMap(() => EMPTY),
            ))),
    );

    openAboutWindow$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenAboutWindow),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => from(this.electronService.ipcMainClient()("openAboutWindow")()).pipe(
                mergeMap(() => EMPTY),
            ))),
    );

    openExternal$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenExternal),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(({payload}) => from(this.electronService.ipcMainClient()("openExternal")({url: payload.url})).pipe(
                mergeMap(() => EMPTY),
            )),
        ),
    );

    openSettingsFolder$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.OpenSettingsFolder),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => from(this.electronService.ipcMainClient()("openSettingsFolder")()).pipe(
                mergeMap(() => EMPTY),
            ))),
    );

    logout$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(NAVIGATION_ACTIONS.is.Logout),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => {
                return from(
                    this.electronService.ipcMainClient()("logout")(),
                ).pipe(
                    concatMap(() => {
                        return [
                            // TODO removing angular router outlets related issues:
                            // - https://github.com/angular/angular/issues/15338
                            // - https://github.com/angular/angular/issues/5122
                            NAVIGATION_ACTIONS.Go({
                                path: [{
                                    outlets: {
                                        [ACCOUNTS_OUTLET]: null,
                                        [SETTINGS_OUTLET]: null,
                                        // use stub outlet as at least one outlet always needs to be active
                                        // that is to say otherwise accounts and settings outlets won't be reset
                                        [STUB_OUTLET]: STUB_PATH,
                                    },
                                }],
                            }),
                            NAVIGATION_ACTIONS.Go({path: ["/"]}),
                        ];
                    }),
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
            ))),
    );

    constructor(
        private electronService: ElectronService,
        private actions$: Actions<{ type: string; payload: any }>,
        private router: Router,
        private ngZone: NgZone,
    ) {}
}
