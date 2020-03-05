import {ChangeDetectionStrategy, Component, Injector, OnInit} from "@angular/core";
import {Subject, from, race} from "rxjs";
import {distinctUntilChanged, filter, map, pairwise, take, takeUntil, withLatestFrom} from "rxjs/operators";
import {equals, pick} from "remeda";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
import {AccountViewAbstractComponent} from "src/web/browser-window/app/_accounts/account-view-abstract.component";
import {WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/constants";
import {parsePackagedWebClientUrl} from "src/shared/util";

const pickCredentialFields = ((fields: Array<keyof AccountConfig>) => {
    return (accountConfig: AccountConfig) => pick(accountConfig, fields);
})(["credentials"]);

const pickLoginDelayFields = ((fields: Array<keyof AccountConfig>) => {
    return (accountConfig: AccountConfig) => pick(accountConfig, fields);
})(["loginDelayUntilSelected", "loginDelaySecondsRange"]);

@Component({
    selector: "electron-mail-account-view-primary",
    templateUrl: "./account-view-primary.component.html",
    styleUrls: ["./account-view-primary.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountViewPrimaryComponent extends AccountViewAbstractComponent implements OnInit {
    constructor(
        injector: Injector,
    ) {
        super("primary", injector);
    }

    ngOnInit() {
        super.ngOnInit();

        this.addSubscription(
            this.filterDomReadyEvent()
                .pipe(take(1))
                .subscribe(({webView}) => this.onWebViewDomReadyOnceHandler(webView)),
        );

        this.addSubscription(
            this.filterDomReadyEvent().subscribe(({webView}) => {
                const packagedWebClientUrl = parsePackagedWebClientUrl(webView.src);

                if (
                    // TODO move "not packaged or blank.html page" check to utility function
                    //      and use it then in "src/electron-preload/webview/primary/index.ts" too
                    !packagedWebClientUrl
                    ||
                    packagedWebClientUrl.pathname === `/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}`
                ) {
                    this.event.emit({
                        type: "log",
                        data: [
                            "info",
                            `Skip webview.dom-ready processing as no packaged web-client detected or the page is the "loader/blank" one`,
                            JSON.stringify({packagedWebClientUrl}),
                        ]
                    });
                    return;
                }

                const finishPromise = this.filterDomReadyOrDestroyedPromise();
                const breakPreviousSyncing$ = new Subject<void>();

                this.event.emit({
                    type: "action",
                    payload: ACCOUNTS_ACTIONS.SetupNotificationChannel({account: this.account, webView, finishPromise}),
                });

                this.account$
                    .pipe(
                        map(({notifications, accountConfig}) => ({
                            pk: {login: accountConfig.login},
                            data: {loggedIn: notifications.loggedIn, database: accountConfig.database},
                        })),
                        // process switching of either "loggedIn" or "database" flags
                        distinctUntilChanged((prev, curr) => equals(prev.data, curr.data)),
                        takeUntil(from(finishPromise)),
                    )
                    .subscribe(({pk, data}) => {
                        breakPreviousSyncing$.next();

                        if (!data.loggedIn || !data.database) {
                            return; // syncing disabled
                        }

                        const syncingFinishPromise = race([
                            from(finishPromise),
                            breakPreviousSyncing$.pipe(take(1)),
                        ]).toPromise().then(() => {});

                        this.event.emit({
                            type: "action",
                            payload: ACCOUNTS_ACTIONS.ToggleSyncing({pk, webView, finishPromise: syncingFinishPromise}),
                        });
                    });
            }),
        );
    }

    private onWebViewDomReadyOnceHandler(webView: Electron.WebviewTag) {
        this.addSubscription(
            this.account$.pipe(
                pairwise(),
                filter(([prev, curr]) => {
                    return (
                        // page changed: "entryUrl" is changeable
                        // so need to react on "url" change too (deep comparison with "equals")
                        curr.notifications.pageType.type !== "unknown"
                        &&
                        !equals(prev.notifications.pageType, curr.notifications.pageType)
                    ) || (
                        // creds changed
                        !equals(pickCredentialFields(prev.accountConfig), pickCredentialFields(curr.accountConfig))
                    ) || (
                        // login delay values changed
                        !equals(pickLoginDelayFields(prev.accountConfig), pickLoginDelayFields(curr.accountConfig))
                    );
                }),
                map(([, curr]) => curr),
            ).subscribe((account) => {
                this.event.emit({type: "log", data: ["info", `onWebViewMounted(): dispatch "TryToLogin"`]});
                this.event.emit({type: "action", payload: ACCOUNTS_ACTIONS.TryToLogin({account, webView})});
            }),
        );

        this.addSubscription(
            this.account$.pipe(
                map((account) => account.fetchSingleMailParams),
                distinctUntilChanged(),
                withLatestFrom(this.account$),
            ).subscribe(([value, account]) => {
                if (!value) {
                    return;
                }
                this.event.emit({
                    type: "action",
                    payload: ACCOUNTS_ACTIONS.FetchSingleMail({account, webView, mailPk: value.mailPk}),
                });
            }),
        );

        this.addSubscription(
            this.account$.pipe(
                distinctUntilChanged(({makeReadMailParams: prev}, {makeReadMailParams: curr}) => curr === prev),
            ).subscribe((account) => {
                if (!account.makeReadMailParams) {
                    return;
                }
                const {messageIds, mailsBundleKey} = account.makeReadMailParams;
                this.event.emit({
                    type: "action",
                    payload: ACCOUNTS_ACTIONS.MakeMailRead({account, webView, messageIds, mailsBundleKey}),
                });
            }),
        );
    }
}
