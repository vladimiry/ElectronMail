import {authenticator} from "otplib";
import {distinctUntilChanged, filter, map} from "rxjs/operators";
import {EMPTY, from, fromEvent, interval, merge, Observable, of, Subscriber, throwError} from "rxjs";

import {AccountNotificationType, WebAccountProtonmail} from "src/shared/model/account";
import {getLocationHref, submitTotpToken, typeInputValue, waitElements} from "src/electron-preload/webview/util";
import {NOTIFICATION_LOGGED_IN_POLLING_INTERVAL, NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL} from "src/electron-preload/webview/common";
import {PROTONMAIL_IPC_WEBVIEW_API, ProtonmailApi} from "src/shared/api/webview/protonmail";

const WINDOW = window as any;
const twoFactorCodeElementId = "twoFactorCode";

delete WINDOW.Notification;

const endpoints: ProtonmailApi = {
    ping: () => EMPTY,

    fillLogin: ({login}) => from((async () => {
        const elements = await waitElements({
            username: () => document.getElementById("username") as HTMLInputElement,
        });
        const username = elements.username();

        await typeInputValue(username, login);
        username.readOnly = true;

        return EMPTY.toPromise();
    })()),

    login: ({login, password}) => from((async () => {
        await endpoints.fillLogin({login}).toPromise();

        const elements = await waitElements({
            password: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("login_btn") as HTMLElement,
        });

        if (elements.password().value) {
            throw new Error("Password is not supposed to be filled already on this stage");
        }

        await typeInputValue(elements.password(), password);
        elements.submit().click();

        return EMPTY.toPromise();
    })()),

    login2fa: ({secret}) => from((async () => {
        const elements = await waitElements({
            input: () => document.getElementById(twoFactorCodeElementId) as HTMLInputElement,
            button: () => document.getElementById("login_btn_2fa") as HTMLElement,
        });

        return await submitTotpToken(
            elements.input(),
            elements.button(),
            () => authenticator.generate(secret),
        );
    })()),

    notification: ({entryUrl}) => {
        try {
            const observables = [];

            // loggedIn
            observables.push(
                interval(NOTIFICATION_LOGGED_IN_POLLING_INTERVAL).pipe(
                    map(() => {
                        const html = WINDOW.angular && WINDOW.angular.element("html");
                        const $injector = html.data("$injector");
                        const authentication = $injector.get("authentication");

                        return authentication && authentication.isLoggedIn();
                    }),
                    distinctUntilChanged((prev, curr) => prev === curr),
                    map((loggedIn) => ({loggedIn})),
                ),
            );

            // pageType
            // TODO listen for location.href change instead of starting polling interval
            observables.push(
                interval(NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                    map(() => {
                        const url = getLocationHref();
                        const pageType: (Pick<AccountNotificationType<WebAccountProtonmail>, "pageType">)["pageType"] = {
                            url,
                            type: "undefined",
                        };

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

                        return {pageType};
                    }),
                    distinctUntilChanged(({pageType: prev}, {pageType: curr}) => prev.type === curr.type),
                ),
            );

            // title
            (() => {
                const titleEl = document.querySelector("title");

                observables.push(
                    titleEl ? fromEvent(titleEl, "DOMSubtreeModified")
                        .pipe(
                            map(() => titleEl.innerText),
                            filter((title) => !!title),
                            distinctUntilChanged((prev, curr) => prev === curr),
                            map((title) => ({title})),
                        ) : of({title: ""}),
                );

                if (titleEl) {
                    // fire initial value emitting
                    setTimeout(() => titleEl.innerText += "");
                }
            })();

            // unread
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

                observables.push(
                    Observable.create((observer: Subscriber<Pick<AccountNotificationType<WebAccountProtonmail>, "unread">>) => {
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
                    }),
                );
            })();

            return merge(...observables);
        } catch (error) {
            return throwError(error);
        }
    },

    unlock: ({mailPassword}) => from((async () => {
        const elements = await waitElements({
            password: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("unlock_btn") as HTMLElement,
        });
        const $formController: any = WINDOW.$(elements.password().form).data("$formController");

        $formController["mailbox-password"].$setViewValue(mailPassword);
        $formController["mailbox-password"].$render();

        elements.submit().click();

        return EMPTY.toPromise();
    })()),
};

PROTONMAIL_IPC_WEBVIEW_API.registerApi(endpoints);
