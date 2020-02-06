import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, forkJoin, from, merge, of} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {catchError, concatMap, filter, finalize, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";

import {
    ACCOUNTS_ACTIONS,
    DB_VIEW_ACTIONS,
    NOTIFICATION_ACTIONS,
    OPTIONS_ACTIONS,
    unionizeActionFilter,
} from "src/web/browser-window/app/store/actions";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {FIRE_SYNCING_ITERATION$} from "src/web/browser-window/app/app.constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/db-view";
import {getZoneNameBoundWebLogger, logActionTypeAndBoundLoggerWithActionType} from "src/web/browser-window/util";

const _logger = getZoneNameBoundWebLogger("[db-view.effects]");

@Injectable()
export class DbViewEffects {
    readonly ipcMainClient = this.api.ipcMainClient();

    mountInstance$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(DB_VIEW_ACTIONS.is.MountInstance),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload: {finishPromise, dbAccountPk}, logger}) => {
                const dispose$ = from(finishPromise).pipe(tap(() => logger.info("dispose")));
                const ipcMainClient = this.api.ipcMainClient({serialization: "jsan"});

                logger.info("setup");

                return merge(
                    // data load (initial)
                    from(ipcMainClient("dbGetAccountDataView")(dbAccountPk)),
                    // data load (on change in the main process)
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                        filter(({payload: {key}}) => key.login === dbAccountPk.login),
                        filter(({payload: {entitiesModified}}) => entitiesModified),
                        switchMap(() => from(ipcMainClient("dbGetAccountDataView")(dbAccountPk))),
                    ),
                    // side notification (status/progress patching)
                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotification),
                        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbIndexerProgressState),
                        mergeMap(({payload}) => {
                            this.ngZone.run(() => {
                                this.store.dispatch(
                                    "key" in payload
                                        ? ACCOUNTS_ACTIONS.PatchProgress({login: payload.key.login, patch: payload.status})
                                        : ACCOUNTS_ACTIONS.PatchGlobalProgress({patch: payload.status}),
                                );
                            });
                            return EMPTY;
                        }),
                    ),
                ).pipe(
                    mergeMap((accountDataView) => {
                        if (accountDataView) {
                            this.ngZone.run(() => {
                                this.store.dispatch(
                                    DB_VIEW_ACTIONS.SetFolders({dbAccountPk, folders: accountDataView.folders}),
                                );
                            });
                        }

                        return EMPTY;
                    }),
                    takeUntil(dispose$),
                );
            }),
        ),
    );

    selectMailRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectMailRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload}) => {
                const {dbAccountPk, mailPk} = payload;
                const ipcMainClient = this.api.ipcMainClient();

                return forkJoin([
                    from(ipcMainClient("dbGetAccountMail")({...dbAccountPk, pk: mailPk})),
                    from(ipcMainClient("dbSearchRootConversationNodes")({...dbAccountPk, mailPks: [mailPk]})).pipe(
                        map((rootNodes) => {
                            if (rootNodes.length !== 1) {
                                throw new Error(`Failed to resolve mail's root conversation node`);
                            }
                            return rootNodes[0];
                        }),
                    ),
                ]).pipe(
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
        ),
    );

    selectConversationMailRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(DB_VIEW_ACTIONS.is.SelectConversationMailRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload: {dbAccountPk, mailPk}}) => {
                return from(
                    this.api.ipcMainClient()("dbGetAccountMail")({...dbAccountPk, pk: mailPk}),
                ).pipe(
                    mergeMap((conversationMail) => of(DB_VIEW_ACTIONS.SelectConversationMail({dbAccountPk, conversationMail}))),
                );
            }),
        ),
    );

    fullTextSearchRequest$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(DB_VIEW_ACTIONS.is.FullTextSearchRequest),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload: {login, query, folderPks}}) => {
                const dbFullTextSearch$ = from(
                    this.api.ipcMainClient()("dbFullTextSearch", {timeoutMs: ONE_SECOND_MS * 5, serialization: "jsan"})({
                        login, query, folderPks,
                    }),
                );
                return dbFullTextSearch$.pipe(
                    mergeMap((value) => [
                        DB_VIEW_ACTIONS.SelectMail({dbAccountPk: {login}}),
                        DB_VIEW_ACTIONS.FullTextSearch({dbAccountPk: {login}, value}),
                    ]),
                );
            }),
        ),
    );

    fetchSingleMail$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.FetchSingleMail),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload: {account, webView, mailPk}, logger}) => {
                const {login} = account.accountConfig;
                const pk = {login};

                return this.api.webViewClient(webView).pipe(
                    mergeMap((webViewClient) => {
                        return from(
                            webViewClient("fetchSingleMail")({...pk, mailPk, zoneName: logger.zoneName()}),
                        ).pipe(
                            mergeMap(() => of(DB_VIEW_ACTIONS.SelectConversationMailRequest({dbAccountPk: pk, mailPk}))),
                            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                            finalize(() => this.store.dispatch(ACCOUNTS_ACTIONS.FetchSingleMailSetParams({pk, mailPk: undefined}))),
                        );
                    }),
                );
            }),
        ),
    );

    makeMailRead$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(ACCOUNTS_ACTIONS.is.MakeMailRead),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            mergeMap(({payload: {account, webView, messageIds, mailsBundleKey}, logger}) => {
                const {login} = account.accountConfig;
                const pk = {login};

                return this.api.webViewClient(webView).pipe(
                    mergeMap((webViewClient) => {
                        return from(
                            webViewClient("makeRead")({...pk, messageIds, zoneName: logger.zoneName()}),
                        ).pipe(
                            mergeMap(() => {
                                FIRE_SYNCING_ITERATION$.next({login});
                                return of(DB_VIEW_ACTIONS.MakeMailsReadInStore({dbAccountPk: pk, mailsBundleKey}));
                            }),
                            catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                            finalize(() => {
                                this.store.dispatch(
                                    ACCOUNTS_ACTIONS.MakeMailReadSetParams({pk, messageIds: undefined, mailsBundleKey}),
                                );
                            }),
                        );
                    }),
                );
            }),
        ),
    );

    toggleLocalDbMailsListViewMode$ = createEffect(
        () => this.actions$.pipe(
            unionizeActionFilter(OPTIONS_ACTIONS.is.ToggleLocalDbMailsListViewMode),
            map(logActionTypeAndBoundLoggerWithActionType({_logger})),
            concatMap(() => {
                return merge(
                    of(OPTIONS_ACTIONS.PatchProgress({togglingLocalDbMailsListViewMode: true})),
                    from(
                        this.ipcMainClient("toggleLocalDbMailsListViewMode")(),
                    ).pipe(
                        concatMap((config) => [
                            OPTIONS_ACTIONS.GetConfigResponse(config),
                        ]),
                        catchError((error) => of(NOTIFICATION_ACTIONS.Error(error))),
                        finalize(() => {
                            this.store.dispatch(OPTIONS_ACTIONS.PatchProgress({togglingLocalDbMailsListViewMode: false}));
                        }),
                    ),
                );
            })),
    );

    constructor(
        private api: ElectronService,
        private store: Store<State>,
        private ngZone: NgZone,
        private actions$: Actions<{ type: string; payload: any }>,
    ) {}
}
