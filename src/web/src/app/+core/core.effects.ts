import {Actions, Effect} from "@ngrx/effects";
import {catchError, filter, mergeMap, switchMap} from "rxjs/operators";
import {Injectable} from "@angular/core";
import {of} from "rxjs";

import {CORE_ACTIONS} from "_@web/src/app/store/actions";
import {ElectronService} from "_@web/src/app/+core/electron.service";

@Injectable()
export class CoreEffects {
    @Effect()
    updateOverlayIcon$ = this.actions$.pipe(
        filter(CORE_ACTIONS.is.UpdateOverlayIcon),
        switchMap(({payload}) => this.electronService
            .callIpcMain("updateOverlayIcon")({hasLoggedOut: payload.hasLoggedOut, unread: payload.unread})
            .pipe(
                mergeMap(() => []),
                catchError((error) => of(CORE_ACTIONS.Fail(error))),
            )),
    );

    constructor(private electronService: ElectronService,
                private actions$: Actions) {}
}
