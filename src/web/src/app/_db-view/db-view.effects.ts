import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, forkJoin, from, merge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {debounceTime, filter, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/db-view";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/src/util";

const _logger = getZoneNameBoundWebLogger("[db-view.effects]");

@Injectable()
export class DbViewEffects {
    @Effect()
    mountInstance$ = (() => {
        const merged$ = EMPTY;

        return this.actions$.pipe(
            unionizeActionFilter(DB_VIEW_ACTIONS.is.MountInstance),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload: {finishPromise, dbAccountPk}, logger}) => {
                const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));
                const apiClient = this.api.ipcMainClient({finishPromise, serialization: "jsan"});
                const observable$ = merge(
                    apiClient("dbGetAccountDataView")(dbAccountPk), // initial load
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                        filter(({payload: {key}}) => key.type === dbAccountPk.type && key.login === dbAccountPk.login),
                        filter(({payload: {entitiesModified}}) => entitiesModified),
                        // tslint:disable-next-line:ban
                        switchMap(() => apiClient("dbGetAccountDataView")(dbAccountPk)),
                    ),
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbIndexerProgressState),
                        mergeMap(({payload}) => {
                            if ("key" in payload) {
                                this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login: payload.key.login, patch: payload.status}));
                            } else {
                                ACCOUNTS_ACTIONS.PatchGlobalProgress({patch: payload.status});
                            }
                            return EMPTY;
                        }),
                    ),
                ).pipe(
                    mergeMap((value) => {
                        return value ? [DB_VIEW_ACTIONS.SetFolders({dbAccountPk, folders: value.folders})] : [];
                    }),
                    debounceTime(300),
                    takeUntil(dispose$),
                );

                logger.info("setup");

                return merge(merged$, observable$);
            }),
        );
    })();

    @Effect()
    selectMailRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectMailRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload}) => {
            const {dbAccountPk, mailPk} = payload;
            const client = this.api.ipcMainClient();

            return forkJoin(
                client("dbGetAccountMail")({...dbAccountPk, pk: mailPk}),
                client("dbSearchRootConversationNodes")({...dbAccountPk, mailPks: [mailPk]}).pipe(
                    map((rootNodes) => {
                        if (rootNodes.length !== 1) {
                            throw new Error(`Failed to resolve mail's root conversation node`);
                        }
                        return rootNodes[0];
                    }),
                ),
            ).pipe(
                mergeMap(([mail, rootNode]) => of(DB_VIEW_ACTIONS.SelectMail({
                    dbAccountPk,
                    value: {
                        rootNode,
                        listMailPk: mail.pk,
                        conversationMail: mail,
                    },
                }))),
            );
        }),
    );

    @Effect()
    selectConversationMailRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectConversationMailRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload: {dbAccountPk, mailPk}}) => {
            return this.api.ipcMainClient()("dbGetAccountMail")({...dbAccountPk, pk: mailPk}).pipe(
                mergeMap((conversationMail) => of(DB_VIEW_ACTIONS.SelectConversationMail({dbAccountPk, conversationMail}))),
            );
        }),
    );

    @Effect()
    fullTextSearchRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.FullTextSearchRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload: {type, login, query, folderPks}}) => {
            return this.api.ipcMainClient()("dbFullTextSearch", {timeoutMs: ONE_SECOND_MS * 5, serialization: "jsan"})({
                type, login, query, folderPks,
            }).pipe(
                mergeMap((value) => of(DB_VIEW_ACTIONS.FullTextSearch({dbAccountPk: {type, login}, value}))),
            );
        }),
    );

    constructor(
        private api: ElectronService,
        private store: Store<State>,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
