import {authenticator} from "otplib";
import {distinctUntilChanged, map, shareReplay, tap} from "rxjs/operators";
import {EMPTY, from, interval, merge, Observable, Subscriber} from "rxjs";

import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {AccountNotificationType, WebAccountProtonmail} from "src/shared/model/account";
import {curryFunctionMembers} from "src/shared/util";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {PROTONMAIL_IPC_WEBVIEW_API, ProtonmailApi} from "src/shared/api/webview/protonmail";

const WINDOW = window as any;
const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[index]");
const twoFactorCodeElementId = "twoFactorCode";

delete WINDOW.Notification;

const endpoints: ProtonmailApi = {
    ping: () => EMPTY,

    fillLogin: ({login, zoneName}) => from((async () => {
        const _logPrefix = ["fillLogin()", zoneName];
        logger.info(..._logPrefix);

        const elements = await waitElements({
            username: () => document.getElementById("username") as HTMLInputElement,
        });
        logger.verbose(..._logPrefix, `elements resolved`);

        await fillInputValue(elements.username, login);
        logger.verbose(..._logPrefix, `input values filled`);

        elements.username.readOnly = true;

        return EMPTY.toPromise();
    })()),

    login: ({login, password, zoneName}) => from((async () => {
        const _logPrefix = ["login()", zoneName];
        logger.info(..._logPrefix);

        await endpoints.fillLogin({login, zoneName}).toPromise();
        logger.verbose(..._logPrefix, `fillLogin() executed`);

        const elements = await waitElements({
            password: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("login_btn") as HTMLElement,
        });
        logger.verbose(..._logPrefix, `elements resolved`);

        if (elements.password.value) {
            throw new Error(`Password is not supposed to be filled already on "login" stage`);
        }

        await fillInputValue(elements.password, password);
        logger.verbose(..._logPrefix, `input values filled`);

        elements.submit.click();
        logger.verbose(..._logPrefix, `clicked`);

        return EMPTY.toPromise();
    })()),

    login2fa: ({secret, zoneName}) => from((async () => {
        const _logPrefix = ["login2fa()", zoneName];
        logger.info(..._logPrefix);

        const elements = await waitElements({
            input: () => document.getElementById(twoFactorCodeElementId) as HTMLInputElement,
            button: () => document.getElementById("login_btn_2fa") as HTMLElement,
        });
        logger.verbose(..._logPrefix, `elements resolved`);

        return await submitTotpToken(
            elements.input,
            elements.button,
            () => authenticator.generate(secret),
            logger,
            _logPrefix,
        );
    })()),

    unlock: ({mailPassword, zoneName}) => from((async () => {
        logger.info("unlock()", zoneName);
        const elements = await waitElements({
            mailboxPassword: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("unlock_btn") as HTMLElement,
        });

        await fillInputValue(elements.mailboxPassword, mailPassword);
        elements.submit.click();

        return EMPTY.toPromise();
    })()),

    notification: ({entryUrl, zoneName}) => {
        const _logPrefix = ["notification()", zoneName];
        logger.info(..._logPrefix);

        type LoggedInOutput = Required<Pick<AccountNotificationType<WebAccountProtonmail>, "loggedIn">>;
        type PageTypeOutput = Required<Pick<AccountNotificationType<WebAccountProtonmail>, "pageType">>;
        type UnreadOutput = Required<Pick<AccountNotificationType<WebAccountProtonmail>, "unread">>;

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
                tap((value) => logger.verbose(..._logPrefix, JSON.stringify(value))),
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

        return merge(...observables).pipe(
            shareReplay(1),
        );
    },
};

PROTONMAIL_IPC_WEBVIEW_API.registerApi(endpoints);
logger.verbose(`api registered, url: ${getLocationHref()}`);

function isLoggedIn(): boolean {
    const htmlElement = WINDOW.angular && typeof WINDOW.angular.element === "function" && WINDOW.angular.element("html");
    const $injector = htmlElement && typeof htmlElement.data === "function" && htmlElement.data("$injector");
    const authentication = $injector && $injector.get("authentication");

    return authentication && authentication.isLoggedIn();
}
