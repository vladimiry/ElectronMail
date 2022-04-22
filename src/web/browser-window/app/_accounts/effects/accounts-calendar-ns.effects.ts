import {Actions, createEffect} from "@ngrx/effects";
import {EMPTY, from, merge, of} from "rxjs";
import {Injectable} from "@angular/core";
import {mergeMap, takeUntil, tap, withLatestFrom} from "rxjs/operators";
import {select, Store} from "@ngrx/store";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {curryFunctionMembers} from "src/shared/util";
import {DESKTOP_NOTIFICATION_ICON_URL} from "src/web/constants";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {getWebLogger, sha256} from "src/web/browser-window/util";
import {ofType} from "src/shared/util/ngrx-of-type";
import {PRODUCT_NAME} from "src/shared/const";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {testProtonCalendarAppPage} from "src/shared/util/proton-webclient";

const _logger = getWebLogger(__filename);

@Injectable()
export class AccountsCalendarNsEffects {
    readonly effect$ = createEffect(
        () => this.actions$.pipe(
            ofType(ACCOUNTS_ACTIONS.SetupCalendarNotificationChannel),
            mergeMap(({payload, ...action}) => {
                const {webView, finishPromise, account: {accountIndex}} = payload;
                const logger = curryFunctionMembers(_logger, `[${action.type}][${accountIndex}]`);
                const {login} = payload.account.accountConfig;
                const dispose$ = from(finishPromise).pipe(tap(() => {
                    logger.info("dispose");
                    this.store.dispatch(
                        this.accountsService.generateCalendarNotificationsStateResetAction({login, optionalAccount: true}),
                    );
                }));

                logger.info("setup");

                return merge(
                    this.api.calendarWebViewClient({webView, accountIndex}, {finishPromise}).pipe(
                        mergeMap((webViewClient) => {
                            return from(
                                webViewClient("notification")({accountIndex}),
                            );
                        }),
                        withLatestFrom(
                            this.store.pipe(
                                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                                mergeMap((account) => account ? [account] : EMPTY),
                            ),
                            from((async () => {
                                return {notificationTag: `calendar_notification_${await sha256(login)}`};
                            })()),
                        ),
                        mergeMap(([notification, {webviewSrcValues}, {notificationTag}]) => {
                            if (!("calendarNotification" in notification)) {
                                return of(ACCOUNTS_ACTIONS.Patch({login, patch: {notifications: notification}}));
                            }

                            if (!notification.calendarNotification) {
                                throw new Error(`Unexpected "Notification" constructor args received.`);
                            }

                            // preventing duplicated desktop notifications
                            // on calendar page the desktop notification gets displayed by calendar itself
                            if (testProtonCalendarAppPage({url: webviewSrcValues.primary, logger}).projectType === "proton-calendar") {
                                return EMPTY;
                            }

                            const [title, options] = notification.calendarNotification;

                            new Notification(
                                `${PRODUCT_NAME}: ${title}`,
                                {
                                    body: typeof options === "object"
                                        ? options.body
                                        : options,
                                    tag: notificationTag,
                                    icon: DESKTOP_NOTIFICATION_ICON_URL,
                                },
                            ).onclick = () => {
                                this.store.dispatch(ACCOUNTS_ACTIONS.Select({login}));
                                this.store.dispatch(NAVIGATION_ACTIONS.ToggleBrowserWindow({forcedState: true}));
                                // TODO consider loading the calendar page (likely with with "confirm")
                            };

                            return EMPTY;
                        }),
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
        private readonly store: Store<State>,
        private readonly accountsService: AccountsService,
    ) {}
}
