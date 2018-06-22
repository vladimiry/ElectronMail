import * as OTPAuth from "otpauth";
import {distinctUntilChanged, filter, map} from "rxjs/operators";
import {from, fromEvent, interval, merge, Observable, Subscriber, throwError} from "rxjs";

import * as Notification from "_shared/ipc-stream/webview/notification-output";
import {Endpoints, IPC_WEBVIEW_API} from "_shared/ipc-stream/webview";
import {waitElements} from "./util";

delete (window as any).Notification;

export const endpoints: Endpoints = {
    fillLogin: ({login}) => from((async () => {
        const elements = await waitElements({
            username: () => document.getElementById("username") as HTMLInputElement,
        });
        const $ = (window as any).$;
        const username = elements.username();
        const $formController: any = $(username.form).data("$formController");

        $formController.username.$setViewValue(login);
        $formController.username.$render();

        username.readOnly = true;

        return {message: `fillLogin: login filled`};
    })()),
    login2fa: ({password}) => from((async () => {
        const submitTimeOutMs = 4000;
        const errorMessage = `Failed to submit two factor token within ${submitTimeOutMs}ms`;

        try {
            await submit();
        } catch (e) {
            if (e.message === errorMessage) {
                // second attempt as token might become expired right before submitting
                await new Promise((resolve) => setTimeout(resolve, submitTimeOutMs));
                await submit();
            }
            throw e;
        }

        return {message: `login2fa: form submitted`};

        async function submit() {
            const url = getUrl();
            const elements = await waitElements({
                twoFactorCode: () => document.getElementById("twoFactorCode") as HTMLInputElement,
                submit: () => document.getElementById("login_btn_2fa") as HTMLElement,
            });
            const $ = (window as any).$;
            const $formController: any = $(elements.twoFactorCode().form).data("$formController");
            const totp = new OTPAuth.TOTP({
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromB32(password),
            });
            const token = totp.generate();

            $formController.twoFactorCode.$setViewValue(token);
            $formController.twoFactorCode.$render();

            elements.submit().click();

            await new Promise((resolve) => setTimeout(resolve, submitTimeOutMs));

            if (getUrl() === url) {
                throw new Error(errorMessage);
            }
        }
    })()),
    login: ({login, password}) => from((async () => {
        const elements = await waitElements({
            username: () => document.getElementById("username") as HTMLInputElement,
            password: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("login_btn") as HTMLElement,
        });
        const $ = (window as any).$;
        const $formController: any = $(elements.username().form).data("$formController");

        $formController.username.$setViewValue(login);
        $formController.username.$render();
        $formController.password.$setViewValue(password);
        $formController.password.$render();

        elements.submit().click();

        return {message: `login: form submitted`};
    })()),
    notification: () => {
        try {
            const observables: Array<Observable<Notification.AccountNotificationOutput>> = [];

            (() => {
                const observable: Observable<Notification.PageTypeNotification> = interval(700).pipe(
                    map(() => {
                        const url = getUrl();
                        const notification: Notification.PageTypeNotification = {type: "pageType", value: {url}};

                        switch (url) {
                            case "https://mail.protonmail.com/login": {
                                const twoFactorCodeEl = document.getElementById("twoFactorCode");
                                const twoFactorCodeElVisible = twoFactorCodeEl && twoFactorCodeEl.offsetParent;

                                if (twoFactorCodeElVisible) {
                                    notification.value.type = "login2fa";
                                } else {
                                    notification.value.type = "login";
                                }

                                break;
                            }
                            case "https://mail.protonmail.com/login/unlock": {
                                notification.value.type = "unlock";
                                break;
                            }
                        }

                        return notification;
                    }),
                    distinctUntilChanged(({value: prev}, {value: curr}) => prev.url === curr.url && prev.type === curr.type),
                );

                observables.push(observable);
            })();

            (() => {
                const titleEl = document.querySelector("title") as HTMLElement;

                // title changing listening
                if (titleEl) {
                    observables.push(
                        fromEvent<Notification.TitleNotification>(titleEl, "DOMSubtreeModified")
                            .pipe(
                                map(() =>
                                    ({type: "title", value: titleEl.innerText} as Notification.TitleNotification),
                                ),
                                filter(({value}) => !!value),
                            ),
                    );

                    // fire initial value emitting
                    setTimeout(() => titleEl.innerText += "");
                }
            })();

            (() => {
                const responseListeners = [
                    {
                        re: new RegExp("https://mail.protonmail.com/api/messages/count"),
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
                        re: new RegExp("https://mail.protonmail.com/api/events/.*=="),
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

                observables.push(Observable.create((observer: Subscriber<Notification.UnreadNotification>) => {
                    XMLHttpRequest.prototype.send = ((original) => {
                        return function(this: XMLHttpRequest) {
                            this.addEventListener("load", function(this: XMLHttpRequest) {
                                responseListeners
                                    .filter(({re}) => re.test(this.responseURL))
                                    .forEach(({handler}) => {
                                        const responseData = JSON.parse(this.responseText);
                                        const value = (handler as any)(responseData);

                                        if (typeof value === "number") {
                                            observer.next({type: "unread", value});
                                        }
                                    });
                            }, false);

                            return original.apply(this, arguments);
                        } as any;
                    })(XMLHttpRequest.prototype.send);
                }));
            })();

            // TODO figure the way to test auth state not using the network requests pooling (scan variables/DOM/XHR passively?)
            // TODO automatically click "refresh (no network)" button when it appears or observe "navigator.onLine" value

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
        const $ = (window as any).$;
        const $formController: any = $(elements.password().form).data("$formController");

        $formController["mailbox-password"].$setViewValue(mailPassword);
        $formController["mailbox-password"].$render();

        elements.submit().click();

        return {message: `unlock: form submitted`};
    })()),
};

IPC_WEBVIEW_API.registerApi(endpoints);

function getUrl(): string {
    return (window as any).location.href;
}
