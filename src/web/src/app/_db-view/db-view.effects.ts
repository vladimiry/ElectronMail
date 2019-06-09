import {Actions, Effect} from "@ngrx/effects";
import {EMPTY, forkJoin, from, merge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {catchError, filter, finalize, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, CORE_ACTIONS, DB_VIEW_ACTIONS, unionizeActionFilter} from "src/web/src/app/store/actions";
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
    mountInstance$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.MountInstance),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload: {finishPromise, dbAccountPk}, logger}) => {
            const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));
            const ipcMainClient = this.api.ipcMainClient({finishPromise, serialization: "jsan"});

            logger.info("setup");

            return merge(
                // data load (initial)
                from(ipcMainClient("dbGetAccountDataView")(dbAccountPk)),
                // data load (on change in the main process)
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.mainProcessNotification),
                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                    filter(({payload: {key}}) => key.type === dbAccountPk.type && key.login === dbAccountPk.login),
                    filter(({payload: {entitiesModified}}) => entitiesModified),
                    switchMap(() => from(ipcMainClient("dbGetAccountDataView")(dbAccountPk))),
                ),
                // side notification (status/progress patching)
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
                    return value
                        ? of(DB_VIEW_ACTIONS.SetFolders({dbAccountPk, folders: value.folders}))
                        : EMPTY;
                }),
                takeUntil(dispose$),
            );
        }),
    );

    @Effect()
    selectMailRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectMailRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload}) => {
            const {dbAccountPk, mailPk} = payload;
            const ipcMainClient = this.api.ipcMainClient();

            return forkJoin(
                from(ipcMainClient("dbGetAccountMail")({...dbAccountPk, pk: mailPk})),
                from(ipcMainClient("dbSearchRootConversationNodes")({...dbAccountPk, mailPks: [mailPk]})).pipe(
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
            return from(
                this.api.ipcMainClient()("dbGetAccountMail")({...dbAccountPk, pk: mailPk}),
            ).pipe(
                mergeMap((conversationMail) => of(DB_VIEW_ACTIONS.SelectConversationMail({dbAccountPk, conversationMail}))),
            );
        }),
    );

    @Effect()
    fullTextSearchRequest$ = this.actions$.pipe(
        unionizeActionFilter(DB_VIEW_ACTIONS.is.FullTextSearchRequest),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload: {type, login, query, folderPks}}) => {
            const dbFullTextSearch$ = from(
                this.api.ipcMainClient()("dbFullTextSearch", {timeoutMs: ONE_SECOND_MS * 5, serialization: "jsan"})({
                    type, login, query, folderPks,
                }),
            );
            return dbFullTextSearch$.pipe(
                mergeMap((value) => [
                    DB_VIEW_ACTIONS.SelectMail({dbAccountPk: {type, login}}),
                    DB_VIEW_ACTIONS.FullTextSearch({dbAccountPk: {type, login}, value}),
                ]),
            );
        }),
    );

    @Effect()
    fetchSingleMail$ = this.actions$.pipe(
        unionizeActionFilter(ACCOUNTS_ACTIONS.is.FetchSingleMail),
        map(logActionTypeAndBoundLoggerWithActionType({_logger})),
        mergeMap(({payload: {account, webView, mailPk}, logger}) => {
            const {type, login} = account.accountConfig;
            const pk = {type, login};

            return this.api.webViewClient(webView, type).pipe(
                mergeMap((webViewClient) => {
                    const fetchSingleMail$ = from(
                        webViewClient("fetchSingleMail")({...pk, mailPk, zoneName: logger.zoneName()}),
                    );
                    return fetchSingleMail$.pipe(
                        mergeMap(() => of(DB_VIEW_ACTIONS.SelectConversationMailRequest({dbAccountPk: pk, mailPk}))),
                        catchError((error) => of(CORE_ACTIONS.Fail(error))),
                        finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.SetFetchSingleMailParams({pk, mailPk: undefined}))),
                    );
                }),
            );
        }),
    );

    constructor(
        private api: ElectronService,
        private store: Store<State>,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
