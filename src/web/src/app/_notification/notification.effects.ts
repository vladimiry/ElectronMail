import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, from, merge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {UnionOf} from "@vladimiry/unionize";
import {catchError, concatMap, filter, map, mergeMap} from "rxjs/operators";

import {ElectronService} from "src/web/src/app/_core/electron.service";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/src/app/store/actions";
import {NOTIFICATIONS_OUTLET, NOTIFICATIONS_PATH} from "src/web/src/app/app.constants";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[notification.effects]");

@Injectable()
export class NotificationEffects {
    @Effect()
    $notification = merge(
        this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.Error)),
        this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.Info)),
        this.actions$.pipe(filter(NOTIFICATION_ACTIONS.is.Update)),
    ).pipe(
        map(() => {
            return NAVIGATION_ACTIONS.Go({path: [{outlets: {[NOTIFICATIONS_OUTLET]: NOTIFICATIONS_PATH}}]});
        }),
    );

    @Effect()
    updateOverlayIcon$ = this.actions$.pipe(
        filter(NOTIFICATION_ACTIONS.is.UpdateOverlayIcon),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload: {hasLoggedOut, unread, unreadBgColor, unreadTextColor}}) => {
            const updateOverlayIcon$ = from(
                this.electronService.ipcMainClient()("updateOverlayIcon")({hasLoggedOut, unread, unreadBgColor, unreadTextColor}),
            );
            return updateOverlayIcon$.pipe(
                mergeMap(() => EMPTY),
                catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
            );
        }),
    );

    constructor(
        private electronService: ElectronService,
        private actions$: Actions<UnionOf<typeof NOTIFICATION_ACTIONS>>,
    ) {}
}
