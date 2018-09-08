import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, from, merge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {concatMap, debounceTime, filter, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";

import {DB_VIEW_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[db-view.effects]");

@Injectable()
export class DbViewEffects {
    @Effect()
    mount$ = (() => {
        const merged$ = EMPTY;

        return this.actions$.pipe(
            unionizeActionFilter(DB_VIEW_ACTIONS.is.MountInstance),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload, logger}) => {
                const {finishPromise, dbAccountPk} = payload;
                const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));
                const apiClient = this.api.ipcMainClient({finishPromise, serialization: "jsan"});
                const observable$ = merge(
                    apiClient("dbGetAccountDataView")(dbAccountPk), // initial load
                    apiClient("notification")().pipe(
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                        // tslint:disable-next-line:ban
                        switchMap(() => apiClient("dbGetAccountDataView")(dbAccountPk)),
                    ),
                ).pipe(
                    debounceTime(300),
                    concatMap((data) => of(DB_VIEW_ACTIONS.PatchInstanceData({dbAccountPk, patch: data}))),
                    takeUntil(dispose$),
                );

                logger.info("setup");

                return merge(merged$, observable$);
            }),
        );
    })();

    constructor(
        private api: ElectronService,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
