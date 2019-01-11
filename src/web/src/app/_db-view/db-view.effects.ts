import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, forkJoin, from, merge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {concatMap, debounceTime, filter, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";

import {DB_VIEW_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/db-view";
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
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                        filter(({payload: p}) => p.key.type === dbAccountPk.type && p.key.login === dbAccountPk.login),
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
    selectListMailToDisplayRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectListMailToDisplayRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload}) => {
            const {dbAccountPk, mailPk} = payload;
            const client = this.api.ipcMainClient();

            return forkJoin(
                client("dbGetAccountMail")({...dbAccountPk, pk: mailPk}),
                client("dbSearchRootNodes")({...dbAccountPk, mailPks: [mailPk]}).pipe(
                    map((rootNodes) => {
                        if (rootNodes.length !== 1) {
                            throw new Error(`Failed to resolve mail's root conversation node`);
                        }
                        return rootNodes[0];
                    }),
                ),
            ).pipe(
                mergeMap(([mail, rootNode]) => of(DB_VIEW_ACTIONS.SelectListMailToDisplay({
                    dbAccountPk,
                    listMailPk: mail.pk,
                    rootNode,
                    rootNodeMail: mail,
                }))),
            );
        }),
    );

    @Effect()
    selectRootNodeMailToDisplayRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectRootNodeMailToDisplayRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload}) => {
            const {dbAccountPk, mailPk} = payload;

            return this.api.ipcMainClient()("dbGetAccountMail")({...dbAccountPk, pk: mailPk}).pipe(
                mergeMap((rootNodeMail) => of(DB_VIEW_ACTIONS.SelectRootNodeMailToDisplay({dbAccountPk, rootNodeMail}))),
            );
        }),
    );

    constructor(
        private api: ElectronService,
        private store: Store<State>,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
