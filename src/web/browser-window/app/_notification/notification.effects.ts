import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from, merge} from "rxjs";
import {Injectable} from "@angular/core";
import {concatMap, map, mergeMap} from "rxjs/operators";

import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NOTIFICATIONS_OUTLET, NOTIFICATIONS_PATH} from "src/web/browser-window/app/app.constants";
import {ofType} from "src/shared/ngrx-util-of-type";

@Injectable()
export class NotificationEffects {
    $notification = createEffect(
        () => merge(
            this.actions$.pipe(ofType(NOTIFICATION_ACTIONS.Error)),
            this.actions$.pipe(ofType(NOTIFICATION_ACTIONS.ErrorSkipLogging)),
            this.actions$.pipe(ofType(NOTIFICATION_ACTIONS.Message)),
            this.actions$.pipe(ofType(NOTIFICATION_ACTIONS.Update)),
        ).pipe(
            map(() => {
                return NAVIGATION_ACTIONS.Go({path: [{outlets: {[NOTIFICATIONS_OUTLET]: NOTIFICATIONS_PATH}}]});
            }),
        ),
    );

    updateOverlayIcon$ = createEffect(
        () => this.actions$.pipe(
            ofType(NOTIFICATION_ACTIONS.UpdateOverlayIcon),
            concatMap(({payload}) => {
                return from(
                    this.electronService.ipcMainClient()("updateOverlayIcon")(payload),
                ).pipe(
                    mergeMap(() => EMPTY),
                );
            }),
        ),
        {dispatch: false},
    );

    constructor(
        private electronService: ElectronService,
        private readonly actions$: Actions,
    ) {}
}
