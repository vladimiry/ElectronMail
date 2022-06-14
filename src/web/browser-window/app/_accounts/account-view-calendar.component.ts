import {Component, Injector} from "@angular/core";
import type {OnInit} from "@angular/core";
import {withLatestFrom} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsService} from "./accounts.service";
import {AccountViewAbstractComponent} from "./account-view-abstract-component.directive";
import {getWebLogger} from "src/web/browser-window/util";
import {testProtonCalendarAppPage} from "src/shared/util/proton-webclient";

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
            this.filterDomReadyEvent()
                .pipe(withLatestFrom(this.account$))
                .subscribe(([{webView}, account]) => {
                    // app set's app notification channel on webview.dom-ready event
                    // which means user is not logged-in yet at this moment, so resetting the state
                    this.action(
                        this.accountsService
                            .generateCalendarNotificationsStateResetAction({login: account.accountConfig.login}),
                    );

                    if (!testProtonCalendarAppPage({url: webView.src, logger: this.logger}).shouldInitProviderApi) {
                        this.log("info", [`skip webview.dom-ready processing for ${webView.src} page`]);
                        return;
                    }

                    this.action(
                        ACCOUNTS_ACTIONS.SetupCalendarNotificationChannel({
                            account,
                            webView,
                            finishPromise: this.filterDomReadyOrDestroyedPromise(),
                        }),
                    );
                }),
        );
    }
}
