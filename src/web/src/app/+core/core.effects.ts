import {Actions, Effect} from "@ngrx/effects";
import {Injectable} from "@angular/core";
import {catchError, concatMap, map, mergeMap} from "rxjs/operators";
import {of} from "rxjs";

import {CORE_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/+core/electron.service";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[options.effects]");

@Injectable()
export class CoreEffects {
    @Effect()
    updateOverlayIcon$ = this.actions$.pipe(
        unionizeActionFilter(CORE_ACTIONS.is.UpdateOverlayIcon),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        concatMap(({payload}) => this.electronService
            .ipcMainClient()("updateOverlayIcon")({hasLoggedOut: payload.hasLoggedOut, unread: payload.unread})
            .pipe(
                mergeMap(() => []),
                catchError((error) => of(CORE_ACTIONS.Fail(error))),
            )),
    );

    constructor(
        private electronService: ElectronService,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
