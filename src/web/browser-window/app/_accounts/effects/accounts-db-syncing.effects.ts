import type {Action} from "@ngrx/store";
import {Actions, createEffect} from "@ngrx/effects";
import {
    catchError, concatMap, debounce, debounceTime, delay, filter, finalize, mergeMap, switchMap, take, takeUntil, tap, withLatestFrom,
} from "rxjs/operators";
import {concat, EMPTY, from, fromEvent, merge, of, race, Subject, throwError, timer} from "rxjs";
import {Injectable} from "@angular/core";
import {noop} from "remeda";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {ElectronService, WebviewPingFailedError} from "src/web/browser-window/app/_core/electron.service";
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
    readonly disposing$ = new Map<string /* login */, Subject<void>>();

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
                            mergeMap(({payload}) => of(ACCOUNTS_ACTIONS.Patch({
                                login, patch: {notifications: {unread: payload.stat.unread}},
                            }))),
                        ),

                        // selecting mail in "proton ui"
                        createEffect(
                            () => this.actions$.pipe(
                                ofType(ACCOUNTS_ACTIONS.SelectMailOnline),
                                filter(({payload: {pk: key}}) => key.login === login),
                                mergeMap(({payload: selectMailOnlineInput}) => concat(
                                    of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {selectingMailOnline: true}})),
                                    this.api.primaryWebViewClient({webView, accountIndex}, {finishPromise, pingTimeoutMs: 7001}).pipe(
                                        mergeMap((webViewClient) => {
                                            const selectMailOnlineInput$ = from(
                                                webViewClient("selectMailOnline", {timeoutMs: ONE_SECOND_MS * 5})({
                                                    ...selectMailOnlineInput,
                                                    accountIndex,
                                                }),
                                            );
                                            return selectMailOnlineInput$.pipe(
                                                mergeMap(() => EMPTY),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {selectingMailOnline: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            );
                                        }),
                                    ),
                                )),
                            ),
                        ),

                        // processing "make mails read" signal fired in the "db-view" module
                        createEffect(
                            () => this.actions$.pipe(
                                ofType(ACCOUNTS_ACTIONS.MakeMailRead),
                                filter(({payload}) => payload.pk.login === login),
                                mergeMap(({payload: {messageIds}}) => concat(
                                    of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {makingMailRead: true}})),
                                    this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7002}).pipe(
                                        mergeMap((webViewClient) => {
                                            return from(
                                                webViewClient("makeMailRead", {timeoutMs: 0})({messageIds, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => this.core.fireSyncingIteration({login})),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {makingMailRead: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            );
                                        }),
                                    ),
                                )),
                            ),
                            {dispatch: false},
                        ),

                        // processing "set mails folder" signal fired in the "db-view" module
                        createEffect(
                            () => this.actions$.pipe(
                                ofType(ACCOUNTS_ACTIONS.SetMailFolder),
                                filter(({payload}) => payload.pk.login === login),
                                mergeMap(({payload: {folderId, messageIds}}) => concat(
                                    of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {settingMailFolder: true}})),
                                    this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7003}).pipe(
                                        mergeMap((webViewClient) => {
                                            return from(
                                                webViewClient("setMailFolder", {timeoutMs: 0})({folderId, messageIds, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => this.core.fireSyncingIteration({login})),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {settingMailFolder: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            );
                                        }),
                                    ),
                                )),
                            ),
                            {dispatch: false},
                        ),

                        // processing "delete messages" signal fired in the "db-view" module
                        createEffect(
                            () => this.actions$.pipe(
                                ofType(ACCOUNTS_ACTIONS.DeleteMessages),
                                filter(({payload}) => payload.pk.login === login),
                                mergeMap(({payload: {messageIds}}) => concat(
                                    of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {deletingMessages: true}})),
                                    this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7004}).pipe(
                                        mergeMap((webViewClient) => {
                                            return from(
                                                webViewClient("deleteMessages", {timeoutMs: 0})({messageIds, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => this.core.fireSyncingIteration({login})),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {deletingMessages: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            );
                                        }),
                                    ),
                                )),
                            ),
                            {dispatch: false},
                        ),

                        // processing "fetch single mail" signal fired in the "db-view" module
                        createEffect(
                            () => this.actions$.pipe(
                                ofType(ACCOUNTS_ACTIONS.FetchSingleMail),
                                filter(({payload}) => payload.pk.login === login),
                                mergeMap(({payload: {pk, mailPk}}) => concat(
                                    of(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {fetchingSingleMail: true}})),
                                    this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7005}).pipe(
                                        // TODO progress on
                                        mergeMap((webViewClient) => {
                                            return from(
                                                webViewClient("fetchSingleMail")({...pk, mailPk, accountIndex}),
                                            ).pipe(
                                                mergeMap(() => of<Action>(
                                                    DB_VIEW_ACTIONS.SelectConversationMailRequest({webAccountPk: pk, mailPk})
                                                )),
                                                finalize(() => {
                                                    this.store.dispatch(
                                                        ACCOUNTS_ACTIONS.PatchProgress(
                                                            {login, patch: {fetchingSingleMail: false}, optionalAccount: true},
                                                        ),
                                                    );
                                                }),
                                            );
                                        }),
                                    ),
                                )),
                            ),
                        ),

                        // syncing
                        this.api.primaryWebViewClient({webView, accountIndex}, {finishPromise, pingTimeoutMs: 7006}).pipe(
                            withLatestFrom(
                                this.store.pipe(
                                    select(OptionsSelectors.FEATURED.config),
                                ),
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
                                        // user might be moving emails from here to there while syncing/"buildDbPatch" cycle is in progress
                                        // debounce call reduces 404 fetch errors as we don't trigger fetching until user got settled down
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
                                            switchMap(() => this.store.pipe(
                                                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                                                filter((account) => Boolean(account && !account.progress.syncing)),
                                            )),
                                        );
                                    }),
                                    concatMap(() => {
                                        return from(
                                            this.api.ipcMainClient()("dbGetAccountMetadata")({login}),
                                        );
                                    }),
                                    concatMap((metadata) => {
                                        const bootstrapping = !isDatabaseBootstrapped(metadata);
                                        const buildDbPatchMethodName = "buildDbPatch";

                                        logger.verbose(`calling "${buildDbPatchMethodName}" api`, JSON.stringify({bootstrapping}));

                                        this.store.dispatch(ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: true}}));

                                        return from(
                                            webViewClient(buildDbPatchMethodName, {timeoutMs: 0})({
                                                login,
                                                accountIndex,
                                                metadata,
                                            }).pipe(
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
                                                    ACCOUNTS_ACTIONS.PatchProgress({login, patch: {syncing: false}, optionalAccount: true}),
                                                );
                                            }),
                                        );
                                    }),
                                );
                            }),
                        ),
                    ).pipe(
                        finalize(() => {
                            this.store.dispatch(ACCOUNTS_ACTIONS.Patch({login, patch: {syncingActivated: false}, optionalAccount: true}));

                            this.api.primaryWebViewClient({webView, accountIndex}, {pingTimeoutMs: 7007}).pipe(
                                take(1),
                                switchMap((webViewClient) => from(
                                    webViewClient("throwErrorOnRateLimitedMethodCall")({accountIndex}),
                                )),
                                catchError((error) => {
                                    return error instanceof WebviewPingFailedError
                                        ? EMPTY // page unload/change case (the db sync gets cancelled implicitly by page unload/change)
                                        : throwError(error);
                                }),
                            ).subscribe(noop);

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

    constructor(
        private readonly actions$: Actions,
        private readonly api: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
    ) {}
}
