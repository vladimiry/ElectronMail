import type {Action} from "@ngrx/store";
import {Actions, createEffect} from "@ngrx/effects";
import {
    catchError, concatMap, debounce, debounceTime, delay, filter, finalize, mergeMap, switchMap, takeUntil, tap, withLatestFrom,
} from "rxjs/operators";
import {concat, EMPTY, from, fromEvent, merge, of, race, Subject, timer} from "rxjs";
import {inject, Injectable} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {FIRE_SYNCING_ITERATION$} from "src/web/browser-window/app/app.constants";
import {getWebLogger} from "src/web/browser-window/util";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {ofType} from "src/shared/util/ngrx-of-type";
import {ONE_SECOND_MS} from "src/shared/const";
import {PING_ONLINE_STATUS_EVERY_SECOND$} from "src/web/browser-window/app/_accounts/const";
import {State} from "src/web/browser-window/app/store/reducers/accounts";

const _logger = getWebLogger(__filename);

@Injectable()
export class AccountsDbSyncingEffects {
    private readonly actions$ = inject(Actions);
    private readonly api = inject(ElectronService);
    private readonly core = inject(CoreService);
    private readonly store = inject<Store<State>>(Store);

    readonly disposing$ = new Map<string, /* login */ Subject<void>>();

    readonly effect$ = createEffect(
        () => {
            return this.actions$.pipe(
                ofType(ACCOUNTS_ACTIONS.ToggleSyncing),
                mergeMap(({payload, ...action}) => {
                    const {pk: {login, accountIndex}, webView, finishPromise} = payload;
                    const logger = curryFunctionMembers(_logger, `[${action.type}][${accountIndex}]`);
                    const dispose$ = new Subject<void>();

                    this.disposing$.get(login)?.next();
                    this.disposing$.set(login, dispose$);

                    logger.info("setup");

                    return merge(
                        of(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: true}})),
                        // processing "db-view"-related notifications received from the main process
                        this.store.pipe(
                            select(OptionsSelectors.FEATURED.mainProcessNotificationAction),
                            ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount),
                            filter(({payload: {key}}) => key.login === login),
                            mergeMap(({payload}) =>
                                of(ACCOUNTS_ACTIONS.Patch({
                                    login,
                                    patch: {notifications: {unread: payload.stat.unread}},
                                }))
                            ),
                        ),
                        // selecting mail in "proton ui"
                        createEffect(
                            () =>
                                this.actions$.pipe(
                                    ofType(ACCOUNTS_ACTIONS.SelectMailOnline),
                                    filter(({payload: {pk: key}}) => key.login === login),
                                    mergeMap(({payload: selectMailOnlineInput}) =>
                                        concat(
                                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {selectingMailOnline: true}})),
                                            from(
                                                this.api.primaryMailWebViewClient({webView}, {finishPromise})(
                                                    "selectMailOnline",
                                                    {timeoutMs: ONE_SECOND_MS * 5},
                                                )({...selectMailOnlineInput, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => EMPTY),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {selectingMailOnline: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            ),
                                        )
                                    ),
                                ),
                        ),
                        // processing "make mails read" signal fired in the "db-view" module
                        createEffect(
                            () =>
                                this.actions$.pipe(
                                    ofType(ACCOUNTS_ACTIONS.MakeMailRead),
                                    filter(({payload}) => payload.pk.login === login),
                                    mergeMap(({payload: {messageIds}}) =>
                                        concat(
                                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {makingMailRead: true}})),
                                            from(
                                                this.api.primaryMailWebViewClient({webView})(
                                                    "makeMailRead",
                                                    {timeoutMs: 0},
                                                )({messageIds, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => this.core.fireSyncingIteration({login})),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {makingMailRead: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            ),
                                        )
                                    ),
                                ),
                            {dispatch: false},
                        ),
                        // processing "set mails folder" signal fired in the "db-view" module
                        createEffect(
                            () =>
                                this.actions$.pipe(
                                    ofType(ACCOUNTS_ACTIONS.SetMailFolder),
                                    filter(({payload}) => payload.pk.login === login),
                                    mergeMap(({payload: {folderId, messageIds}}) =>
                                        concat(
                                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {settingMailFolder: true}})),
                                            from(
                                                this.api.primaryMailWebViewClient({webView})(
                                                    "setMailFolder",
                                                    {timeoutMs: 0},
                                                )({folderId, messageIds, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => this.core.fireSyncingIteration({login})),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {settingMailFolder: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            ),
                                        )
                                    ),
                                ),
                            {dispatch: false},
                        ),
                        // processing "delete messages" signal fired in the "db-view" module
                        createEffect(
                            () =>
                                this.actions$.pipe(
                                    ofType(ACCOUNTS_ACTIONS.DeleteMessages),
                                    filter(({payload}) => payload.pk.login === login),
                                    mergeMap(({payload: {messageIds}}) =>
                                        concat(
                                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {deletingMessages: true}})),
                                            from(
                                                this.api.primaryMailWebViewClient({webView})(
                                                    "deleteMessages",
                                                    {timeoutMs: 0},
                                                )({messageIds, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => this.core.fireSyncingIteration({login})),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {deletingMessages: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            ),
                                        )
                                    ),
                                ),
                            {dispatch: false},
                        ),
                        // processing "fetch single mail" signal fired in the "db-view" module
                        createEffect(
                            () =>
                                this.actions$.pipe(
                                    ofType(ACCOUNTS_ACTIONS.FetchSingleMail),
                                    filter(({payload}) => payload.pk.login === login),
                                    mergeMap(({payload: {pk, mailPk}}) =>
                                        concat(
                                            of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {fetchingSingleMail: true}})),
                                            from(
                                                this.api.primaryMailWebViewClient({webView})("fetchSingleMail")({
                                                    ...pk,
                                                    mailPk,
                                                    accountIndex,
                                                }),
                                            ).pipe(
                                                mergeMap(() =>
                                                    of<Action>(
                                                        DB_VIEW_ACTIONS.SelectConversationMailRequest({webAccountPk: pk, mailPk}),
                                                    )
                                                ),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {fetchingSingleMail: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            ),
                                        )
                                    ),
                                ),
                        ),
                        (() => {
                            const buildDbPatchMethodName = "buildDbPatch";

                            return of(
                                this.api.primaryMailWebViewClient({webView}, {finishPromise})(buildDbPatchMethodName, {timeoutMs: 0}),
                            ).pipe(
                                withLatestFrom(
                                    this.store.pipe(select(OptionsSelectors.FEATURED.config)),
                                ),
                                mergeMap((
                                    [webViewClient, {dbSyncingIntervalTrigger, dbSyncingOnlineTriggerDelay, dbSyncingFiredTriggerDebounce}],
                                ) => {
                                    const syncingIterationTrigger$ = merge(
                                        timer(0, dbSyncingIntervalTrigger).pipe(
                                            tap(() => logger.verbose(`triggered by: timer`)),
                                        ),
                                        fromEvent(window, "online").pipe(
                                            tap(() => logger.verbose(`triggered by: "window.online" event`)),
                                            delay(dbSyncingOnlineTriggerDelay),
                                        ),
                                        FIRE_SYNCING_ITERATION$.pipe(
                                            filter((value) => value.login === login),
                                            tap(() => logger.verbose(`triggered by: FIRE_SYNCING_ITERATION$`)),
                                            // user might be moving emails while syncing/"buildDbPatch" cycle is in progress
                                            // debounce call reduces 404 fetch errors as we don't trigger fetching until user settled down
                                            // debouncing the fetching signal we strive to process larger group of events in
                                            // a single sync iteration
                                            debounceTime(dbSyncingFiredTriggerDebounce),
                                        ),
                                    );

                                    return syncingIterationTrigger$.pipe(
                                        debounceTime(ONE_SECOND_MS),
                                        debounce(() => PING_ONLINE_STATUS_EVERY_SECOND$),
                                        debounce(() => { // "not syncing" ping
                                            return timer(0, ONE_SECOND_MS).pipe(
                                                switchMap(() =>
                                                    this.store.pipe(
                                                        select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                                                        filter((account) => Boolean(account && !account.progress.syncing)),
                                                    )
                                                ),
                                            );
                                        }),
                                        concatMap(() => {
                                            return from(
                                                this.api.ipcMainClient()("dbGetAccountMetadata")({login}),
                                            );
                                        }),
                                        concatMap((metadata) => {
                                            const bootstrapping = !isDatabaseBootstrapped(metadata);

                                            logger.verbose(`calling "${buildDbPatchMethodName}" api`, JSON.stringify({bootstrapping}));

                                            this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: true}}));

                                            return from(
                                                webViewClient({login, accountIndex, metadata}).pipe(
                                                    tap(({progress: syncProgress}) => {
                                                        if (!bootstrapping) return;
                                                        logger.info(buildDbPatchMethodName, syncProgress);
                                                        this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncProgress}}));
                                                    }),
                                                    catchError((error) => {
                                                        return of(
                                                            NOTIFICATION_ACTIONS.Error(
                                                                error, // eslint-disable-line @typescript-eslint/no-unsafe-argument
                                                            ),
                                                        );
                                                    }),
                                                ),
                                            ).pipe(
                                                concatMap(() => of(ACCOUNTS_ACTIONS.Synced({pk: {login, accountIndex}}))),
                                                takeUntil(
                                                    fromEvent(window, "offline").pipe(
                                                        tap(() => logger.verbose(`offline event`)),
                                                    ),
                                                ),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress({
                                                            login,
                                                            patch: {syncing: false},
                                                            optionalAccount: true,
                                                        }),
                                                    );
                                                }),
                                            );
                                        }),
                                    );
                                }),
                            );
                        })(),
                    ).pipe(
                        finalize(() => {
                            this.store.dispatch(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: false}, optionalAccount: true}));

                            {
                                const methodName = "throwErrorOnRateLimitedMethodCall";
                                this.api.primaryMailWebViewClient({webView})(
                                    methodName,
                                    {timeoutMs: ONE_SECOND_MS},
                                )({accountIndex}).catch((error) => {
                                    if (
                                        (error as {message?: string})
                                            .message?.includes(`Invocation timeout of calling "${methodName}" method`)
                                    ) { // page unload/change case (the db sync gets cancelled implicitly by page unload/change)
                                        return;
                                    }
                                    throw error;
                                });
                            }

                            logger.info("dispose");
                        }),
                        takeUntil(
                            race(
                                from(finishPromise),
                                dispose$,
                            ),
                        ),
                    );
                }),
            );
        },
    );
}
