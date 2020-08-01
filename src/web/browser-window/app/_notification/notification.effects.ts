import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from, merge} from "rxjs";
import {Injectable} from "@angular/core";
import {UnionOf} from "@vladimiry/unionize";
import {concatMap, filter, map, mergeMap} from "rxjs/operators";

import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NOTIFICATIONS_OUTLET, NOTIFICATIONS_PATH} from "src/web/browser-window/app/app.constants";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";

const _logger = getZoneNameBoundWebLogger("[notification.effects]");

@Injectable()
export class NotificationEffects {
    $notification = createEffect(
        () => merge(
            this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.Error)),
            this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.ErrorSkipLogging)),
            this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.Message)),
            this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.Update)),
        ).pipe(
            map(() => {
                return NAVIGATION_ACTIONS.Go({path: [{outlets: {[NOTIFICATIONS_OUTLET]: NOTIFICATIONS_PATH}}]});
            }),
        ),
    );

    updateOverlayIcon$ = createEffect(
        () => this.actions$.pipe(
            filter(NOTIFICATION_ACTIONS.is.UpdateOverlayIcon),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
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
        private actions$: Actions<UnionOf<typeof NOTIFICATION_ACTIONS>>,
    ) {}
}
