import {Component, Injector} from "@angular/core";
import type {OnInit} from "@angular/core";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsService} from "src/web/browser-window/app/_accounts/accounts.service";
import {AccountViewAbstractComponent} from "src/web/browser-window/app/_accounts/account-view-abstract.component";
import {getWebLogger} from "src/web/browser-window/util";
import {testProtonCalendarAppPage} from "src/shared/util";

@Component({
    selector: "electron-mail-account-view-calendar",
    template: "",
})
export class AccountViewCalendarComponent extends AccountViewAbstractComponent implements OnInit {
    private readonly logger = getWebLogger(__filename, nameof(AccountViewCalendarComponent));

    private readonly accountsService: AccountsService;

    constructor(
        injector: Injector,
    ) {
        super("calendar", injector);
        this.accountsService = injector.get(AccountsService);
    }

    ngOnInit(): void {
        this.addSubscription(
            this.filterDomReadyEvent().subscribe(({webView}) => {
                // app set's app notification channel on webview.dom-ready event
                // which means user is not logged-in yet at this moment, so resetting the state
                this.action(
                    this.accountsService
                        .generateCalendarNotificationsStateResetAction({login: this.account.accountConfig.login}),
                );

                if (!testProtonCalendarAppPage({url: webView.src, logger: this.logger}).shouldInitProviderApi) {
                    this.log("info", [`skip webview.dom-ready processing for ${webView.src} page`]);
                    return;
                }

                this.action(
                    ACCOUNTS_ACTIONS.SetupCalendarNotificationChannel({
                        account: this.account,
                        webView,
                        finishPromise: this.filterDomReadyOrDestroyedPromise(),
                    }),
                );
            }),
        );
    }
}
