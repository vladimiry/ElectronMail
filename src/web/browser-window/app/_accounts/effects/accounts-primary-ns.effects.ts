import {Actions, createEffect} from "@ngrx/effects";
import {catchError, distinctUntilChanged, filter, mergeMap, skip, takeUntil, tap, withLatestFrom} from "rxjs/operators";
import {EMPTY, from, merge, of, throwError} from "rxjs";
import {Injectable} from "@angular/core";
import {select, Store} from "@ngrx/store";
import {serializeError} from "serialize-error";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {curryFunctionMembers} from "src/shared/util";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {FIRE_SYNCING_ITERATION$} from "src/web/browser-window/app/app.constants";
import {getWebLogger} from "src/web/browser-window/util";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {ofType} from "src/shared/util/ngrx-of-type";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolveProtonApiOrigin} from "src/shared/util/proton-url";
import {State} from "src/web/browser-window/app/store/reducers/accounts";

const _logger = getWebLogger(__filename);

@Injectable()
export class AccountsPrimaryNsEffects {
    readonly effect$ = createEffect(
        () => this.actions$.pipe(
            ofType(ACCOUNTS_ACTIONS.SetupPrimaryNotificationChannel),
            mergeMap(({payload, ...action}) => {
                const {webView, finishPromise, account: {accountIndex, accountConfig: {login, entryUrl: accountEntryUrl}}} = payload;
                const logger = curryFunctionMembers(_logger, `[${action.type}][${accountIndex}]`);
                const dispose$ = from(finishPromise).pipe(tap(() => {
                    logger.info("dispose");
                    this.store.dispatch(
                        this.accountsService.generatePrimaryNotificationsStateResetAction({login, optionalAccount: true}),
                    );
                }));
                const {sessionStorage: {apiEndpointOrigin: apiEndpointOriginSS}}
                    = this.core.parseEntryUrl(payload.account.accountConfig, "proton-mail");
                const entryApiUrl = resolveProtonApiOrigin(
                    {accountEntryUrl, subdomain: PROVIDER_REPO_MAP["proton-mail"].apiSubdomain},
                );

                logger.info("setup");

                return merge(
                    from(
                        this.api.primaryWebViewClient({webView}, {finishPromise})("notification")({
                            login,
                            entryApiUrl,
                            apiEndpointOriginSS,
                            accountIndex
                        }),
                    ).pipe(
                        withLatestFrom(
                            this.store.pipe(
                                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                            ),
                        ),
                        mergeMap(([notification, account]) => {
                            if (typeof notification.batchEntityUpdatesCounter !== "undefined") {
                                FIRE_SYNCING_ITERATION$.next({login});
                                return EMPTY;
                            }

                            // app derives "unread" value form the database in case of activated database syncing
                            // so "unread" notification should be ignored
                            if (account && account.syncingActivated && typeof notification.unread === "number") {
                                return EMPTY;
                            }

                            return of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: notification}}));
                        }),
                    ),

                    this.store.pipe(
                        select(OptionsSelectors.FEATURED.mainProcessNotificationAction),
                        ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbAttachmentExportRequest),
                        filter(({payload: {key}}) => key.login === login),
                        mergeMap(({payload}) => {
                            // TODO live attachments export: fire error if offline or not signed-in into the account
                            return from(
                                this.api.primaryWebViewClient({webView}, {finishPromise})(
                                    "exportMailAttachments", {timeoutMs: payload.timeoutMs},
                                )({
                                    uuid: payload.uuid,
                                    mailPk: payload.mailPk,
                                    login: payload.key.login,
                                    accountIndex,
                                }),
                            ).pipe(
                                catchError((error) => {
                                    return from(
                                        this.api.ipcMainClient()("dbExportMailAttachmentsNotification")({
                                            uuid: payload.uuid,
                                            accountPk: {login},
                                            attachments: [], // stub data
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                                            serializedError: serializeError(error),
                                        })
                                    ).pipe(
                                        mergeMap(() => throwError(error)),
                                    );
                                }),
                                mergeMap(() => EMPTY),
                            );
                        }),
                    ),

                    // WARN: only needs to be processed for the account that already got a webview created (loaded account page case)
                    // this processing intended to trigger the "webview.partition" update via the "unload" action (component re-creating)
                    this.store.pipe(
                        select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                        mergeMap((value) => value ? of(value) : EMPTY),
                        distinctUntilChanged(({accountConfig: {entryUrl: prev}}, {accountConfig: {entryUrl: curr}}) => curr === prev),
                        skip(1),
                        mergeMap(() => of(ACCOUNTS_ACTIONS.Unload({login}))),
                    ),
                ).pipe(
                    takeUntil(dispose$),
                );
            }),
        ),
    );

    constructor(
        private readonly actions$: Actions,
        private readonly api: ElectronService,
        private readonly core: CoreService,
        private readonly store: Store<State>,
        private readonly accountsService: AccountsService,
    ) { }
}
