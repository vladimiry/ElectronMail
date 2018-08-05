import {authenticator} from "otplib";
import {distinctUntilChanged, map, tap} from "rxjs/operators";
import {EMPTY, from, interval, merge, Observable, Subscriber} from "rxjs";

import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {NotificationsProtonmail} from "src/shared/model/account";
import {PROTONMAIL_IPC_WEBVIEW_API, ProtonmailApi} from "src/shared/api/webview/protonmail";

const WINDOW = window as any;
const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[index]");
const twoFactorCodeElementId = "twoFactorCode";

delete WINDOW.Notification;

const endpoints: ProtonmailApi = {
    ping: () => EMPTY,

    fillLogin: ({login, zoneName}) => from((async () => {
        const logger = curryFunctionMembers(_logger, "fillLogin()", zoneName);
        logger.info();

        const elements = await waitElements({
            username: () => document.getElementById("username") as HTMLInputElement,
        });
        logger.verbose(`elements resolved`);

        await fillInputValue(elements.username, login);
        logger.verbose(`input values filled`);

        elements.username.readOnly = true;

        return EMPTY.toPromise();
    })()),

    login: ({login, password, zoneName}) => from((async () => {
        const logger = curryFunctionMembers(_logger, "login()", zoneName);
        logger.info();

        await endpoints.fillLogin({login, zoneName}).toPromise();
        logger.verbose(`fillLogin() executed`);

        const elements = await waitElements({
            password: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("login_btn") as HTMLElement,
        });
        logger.verbose(`elements resolved`);

        if (elements.password.value) {
            throw new Error(`Password is not supposed to be filled already on "login" stage`);
        }

        await fillInputValue(elements.password, password);
        logger.verbose(`input values filled`);

        elements.submit.click();
        logger.verbose(`clicked`);

        return EMPTY.toPromise();
    })()),

    login2fa: ({secret, zoneName}) => from((async () => {
        const logger = curryFunctionMembers(_logger, "login2fa()", zoneName);
        logger.info();

        const elements = await waitElements({
            input: () => document.getElementById(twoFactorCodeElementId) as HTMLInputElement,
            button: () => document.getElementById("login_btn_2fa") as HTMLElement,
        });
        logger.verbose(`elements resolved`);

        return await submitTotpToken(
            elements.input,
            elements.button,
            () => authenticator.generate(secret),
            logger,
        );
    })()),

    unlock: ({mailPassword, zoneName}) => from((async () => {
        curryFunctionMembers(_logger, "unlock()", zoneName).info();

        const elements = await waitElements({
            mailboxPassword: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("unlock_btn") as HTMLElement,
        });

        await fillInputValue(elements.mailboxPassword, mailPassword);
        elements.submit.click();

        return EMPTY.toPromise();
    })()),

    notification: ({entryUrl, zoneName}) => {
        const logger = curryFunctionMembers(_logger, "notification()", zoneName);
        logger.info();

        type LoggedInOutput = Required<Pick<NotificationsProtonmail, "loggedIn">>;
        type PageTypeOutput = Required<Pick<NotificationsProtonmail, "pageType">>;
        type UnreadOutput = Required<Pick<NotificationsProtonmail, "unread">>;

        const observables: [
            Observable<LoggedInOutput>,
            Observable<PageTypeOutput>,
            Observable<UnreadOutput>
            ] = [
            interval(NOTIFICATION_LOGGED_IN_POLLING_INTERVAL).pipe(
                map(() => isLoggedIn()),
                distinctUntilChanged(),
                map((loggedIn) => ({loggedIn})),
            ),

            // TODO listen for location.href change instead of starting polling interval
            interval(NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                map(() => {
                    const url = getLocationHref();
                    const pageType: PageTypeOutput["pageType"] = {url, type: "unknown"};

                    if (!isLoggedIn()) {
                        switch (url) {
                            case `${entryUrl}/login`: {
                                const twoFactorCode = document.getElementById(twoFactorCodeElementId);
                                const twoFactorCodeVisible = twoFactorCode && twoFactorCode.offsetParent;

                                if (twoFactorCodeVisible) {
                                    pageType.type = "login2fa";
                                } else {
                                    pageType.type = "login";
                                }

                                break;
                            }
                            case `${entryUrl}/login/unlock`: {
                                pageType.type = "unlock";
                                break;
                            }
                        }
                    }

                    return {pageType};
                }),
                distinctUntilChanged(({pageType: prev}, {pageType: curr}) => curr.type === prev.type),
                tap((value) => logger.verbose(JSON.stringify(value))),
            ),

            (() => {
                const responseListeners = [
                    {
                        re: new RegExp(`${entryUrl}/api/messages/count`),
                        handler: ({Counts}: { Counts?: Array<{ LabelID: string; Unread: number; }> }) => {
                            if (!Counts) {
                                return;
                            }

                            return Counts
                                .filter(({LabelID}) => LabelID === "0")
                                .reduce((accumulator, item) => accumulator + item.Unread, 0);
                        },
                    },
                    {
                        re: new RegExp(`${entryUrl}/api/events/.*==`),
                        handler: ({MessageCounts}: { MessageCounts?: Array<{ LabelID: string; Unread: number; }> }) => {
                            if (!MessageCounts) {
                                return;
                            }

                            return MessageCounts
                                .filter(({LabelID}) => LabelID === "0")
                                .reduce((accumulator, item) => accumulator + item.Unread, 0);
                        },
                    },
                ];

                return Observable.create((observer: Subscriber<UnreadOutput>) => {
                    XMLHttpRequest.prototype.send = ((original) => {
                        return function(this: XMLHttpRequest) {
                            this.addEventListener("load", function(this: XMLHttpRequest) {
                                responseListeners
                                    .filter(({re}) => re.test(this.responseURL))
                                    .forEach(({handler}) => {
                                        const responseData = JSON.parse(this.responseText);
                                        const value = (handler as any)(responseData);

                                        if (typeof value === "number") {
                                            observer.next({unread: value});
                                        }
                                    });
                            }, false);

                            return original.apply(this, arguments);
                        } as any;
                    })(XMLHttpRequest.prototype.send);
                }).pipe(
                    distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                );
            })(),
        ];

        return merge(...observables);
    },
};

PROTONMAIL_IPC_WEBVIEW_API.registerApi(endpoints);
_logger.verbose(`api registered, url: ${getLocationHref()}`);

function isLoggedIn(): boolean {
    const htmlElement = WINDOW.angular && typeof WINDOW.angular.element === "function" && WINDOW.angular.element("html");
    const $injector = htmlElement && typeof htmlElement.data === "function" && htmlElement.data("$injector");
    const authentication = $injector && $injector.get("authentication");

    return authentication && authentication.isLoggedIn();
}
