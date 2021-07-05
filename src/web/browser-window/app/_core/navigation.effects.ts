import {Actions, createEffect, ofType} from "@ngrx/effects";
import {EMPTY, from} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Router} from "@angular/router";
import {concatMap, mergeMap} from "rxjs/operators";

import {ACCOUNTS_OUTLET, SETTINGS_OUTLET, STUB_OUTLET, STUB_PATH} from "src/web/browser-window/app/app.constants";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {curryFunctionMembers} from "src/shared/util";
import {getWebLogger} from "src/web/browser-window/util";

const _logger = getWebLogger(__filename);

@Injectable()
export class NavigationEffects {
    go$ = createEffect(
        () => this.actions$.pipe(
            ofType(NAVIGATION_ACTIONS.Go),
            concatMap(({payload, ...action}) => {
                const logger = curryFunctionMembers(_logger, `[${action.type}]`);
                const {path, extras, queryParams} = payload;
                // WARN privacy note: do not log "queryParams"
                // since it might be filled with sensitive data (like "login"/"user name")
                logger.verbose(JSON.stringify({path, extras}));
                return from(
                    this.ngZone.run(async () => {
                        return this.router.navigate(path, {queryParams, ...extras});
                    }),
                );
            }),
            concatMap(() => EMPTY),
        ),
        {dispatch: false},
    );

    toggleBrowserWindow$ = createEffect(
        () => this.actions$.pipe(
            ofType(NAVIGATION_ACTIONS.ToggleBrowserWindow),
            concatMap(({payload}) => from(this.electronService.ipcMainClient()("toggleBrowserWindow")(payload)).pipe(
                mergeMap(() => EMPTY),
            )),
        ),
        {dispatch: false},
    );

    openAboutWindow$ = createEffect(
        () => this.actions$.pipe(
            ofType(NAVIGATION_ACTIONS.OpenAboutWindow),
            concatMap(() => from(this.electronService.ipcMainClient()("openAboutWindow")()).pipe(
                mergeMap(() => EMPTY),
            )),
        ),
        {dispatch: false},
    );

    openExternal$ = createEffect(
        () => this.actions$.pipe(
            ofType(NAVIGATION_ACTIONS.OpenExternal),
            concatMap(({payload}) => from(this.electronService.ipcMainClient()("openExternal")({url: payload.url})).pipe(
                mergeMap(() => EMPTY),
            )),
        ),
        {dispatch: false},
    );

    openSettingsFolder$ = createEffect(
        () => this.actions$.pipe(
            ofType(NAVIGATION_ACTIONS.OpenSettingsFolder),
            concatMap(() => from(this.electronService.ipcMainClient()("openSettingsFolder")()).pipe(
                mergeMap(() => EMPTY),
            )),
        ),
        {dispatch: false},
    );

    logout$ = createEffect(
        () => this.actions$.pipe(
            ofType(NAVIGATION_ACTIONS.Logout),
            concatMap(({payload: {skipKeytarProcessing}}) => {
                return from(
                    this.electronService.ipcMainClient()("logout")({skipKeytarProcessing}),
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
            ofType(NAVIGATION_ACTIONS.Quit),
            concatMap(() => from(this.electronService.ipcMainClient()("quit")()).pipe(
                mergeMap(() => EMPTY),
            )),
        ),
        {dispatch: false},
    );

    constructor(
        private electronService: ElectronService,
        private readonly actions$: Actions,
        private router: Router,
        private ngZone: NgZone,
    ) {}
}
