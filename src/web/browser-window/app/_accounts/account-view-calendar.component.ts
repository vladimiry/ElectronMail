import {Component, Injector} from "@angular/core";
import {filter, withLatestFrom} from "rxjs/operators";
import {firstValueFrom} from "rxjs";
import type {OnInit} from "@angular/core";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsService} from "./accounts.service";
import {AccountViewAbstractComponent} from "./account-view-abstract-component.directive";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";

@Component({
    standalone: false,
    selector: "electron-mail-account-view-calendar",
    template: "",
})
export class AccountViewCalendarComponent extends AccountViewAbstractComponent implements OnInit {
    // private readonly logger = getWebLogger(__filename, nameof(AccountViewCalendarComponent));

    private readonly accountsService: AccountsService;

    constructor(
        injector: Injector,
    ) {
        super("calendar", injector);
        this.accountsService = injector.get(AccountsService);
    }

    ngOnInit(): void {
        this.addSubscription(
            this.filterEvent("ipc-message")
                .pipe(
                    filter(({channel}) => channel === IPC_WEBVIEW_API_CHANNELS_MAP.calendar.registered),
                    withLatestFrom(this.account$),
                )
                .subscribe(([{webView}, account]) => {
                    this.action(
                        ACCOUNTS_ACTIONS.SetupCalendarNotificationChannel({
                            account,
                            webView,
                            finishPromise: firstValueFrom(this.buildNavigationOrDestroyingSingleNotification()),
                        }),
                    );
                }),
        );

        this.addSubscription(
            this.filterEvent("dom-ready")
                .pipe(withLatestFrom(this.account$))
                .subscribe(([, account]) => {
                    // app set's app notification channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    this.action(
                        this.accountsService
                            .generateCalendarNotificationsStateResetAction({login: account.accountConfig.login}),
                    );
                }),
        );
    }
}
