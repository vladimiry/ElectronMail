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
                        filter(({payload: patchPayload}) => patchPayload.entitiesModified),
                        // tslint:disable-next-line:ban
                        switchMap(() => apiClient("dbGetAccountDataView")(dbAccountPk)),
                    ),
                ).pipe(
                    concatMap((data) => data ? [DB_VIEW_ACTIONS.SetFolders({dbAccountPk, folders: data.folders})] : []),
                    debounceTime(300),
                    takeUntil(dispose$),
                );

                logger.info("setup");

                return merge(merged$, observable$);
            }),
        );
    })();

    @Effect()
    selectMail$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectMailRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload}) => {
            const {dbAccountPk, mailPk} = payload;

            return this.api.ipcMainClient()("dbGetAccountMail")({...dbAccountPk, pk: mailPk}).pipe(
                mergeMap((mail) => of(DB_VIEW_ACTIONS.SelectMail({dbAccountPk, mail}))),
            );
        }),
    );

    constructor(
        private api: ElectronService,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
