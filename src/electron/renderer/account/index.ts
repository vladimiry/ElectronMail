import {Observable} from "rxjs/Observable";
import {Subscriber} from "rxjs/Subscriber";
import {merge} from "rxjs/observable/merge";
import {fromEvent} from "rxjs/observable/fromEvent";
import {_throw} from "rxjs/observable/throw";
import {filter, map} from "rxjs/operators";

import {IpcRendererActions} from "_shared/electron-actions";
import {ipcRendererObservable, ipcRendererOn, waitElements} from "./util";

delete (window as any).Notification;

ipcRendererObservable<IpcRendererActions.Notification.Type>(IpcRendererActions.Notification.channel, () => {
    try {
        const observables: Array<Observable<IpcRendererActions.Notification.Type["o"]>> = [];

        (() => {
            const titleEl = document.querySelector("title") as HTMLElement;

            // title changing listening
            if (titleEl) {
                observables.push(
                    fromEvent<IpcRendererActions.Notification.TitleNotification>(titleEl, "DOMSubtreeModified")
                        .pipe(
                            map(() =>
                                ({type: "title", value: titleEl.innerText} as IpcRendererActions.Notification.TitleNotification),
                            ),
                            filter(({value}) => !!value),
                        ),
                );

                // fire initial value emitting
                setTimeout(() => titleEl.innerText += "");
            }
        })();

        (() => {
            // if (!location.href.startsWith(WebAccountPageUrl.Inbox.toString())) {
            //     return;
            // }

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

            observables.push(Observable.create((observer: Subscriber<IpcRendererActions.Notification.UnreadNotification>) => {
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
        return _throw(error);
    }
});

ipcRendererOn<IpcRendererActions.FillLogin.Type>(IpcRendererActions.FillLogin.channel, async ({payload}) => {
    const elements = await waitElements({
        username: () => document.getElementById("username") as HTMLInputElement,
    });
    const $ = (window as any).$;
    const username = elements.username();
    const $formController: any = $(username.form).data("$formController");

    $formController.username.$setViewValue(payload.login);
    $formController.username.$render();

    username.readOnly = true;

    return {message: `${IpcRendererActions.Login.channel}: login filled`};
});

ipcRendererOn<IpcRendererActions.Login.Type>(IpcRendererActions.Login.channel, async ({payload}) => {
    const elements = await waitElements({
        username: () => document.getElementById("username") as HTMLInputElement,
        password: () => document.getElementById("password") as HTMLInputElement,
        submit: () => document.getElementById("login_btn") as HTMLElement,
    });
    const $ = (window as any).$;
    const $formController: any = $(elements.username().form).data("$formController");

    $formController.username.$setViewValue(payload.login);
    $formController.username.$render();
    $formController.password.$setViewValue(payload.password);
    $formController.password.$render();

    elements.submit().click();

    return {message: `${IpcRendererActions.Login.channel}: form submitted`};
});

ipcRendererOn<IpcRendererActions.Unlock.Type>(IpcRendererActions.Unlock.channel, async ({payload}) => {
    const elements = await waitElements({
        password: () => document.getElementById("password") as HTMLInputElement,
        submit: () => document.getElementById("unlock_btn") as HTMLElement,
    });
    const $ = (window as any).$;
    const $formController: any = $(elements.password().form).data("$formController");

    $formController["mailbox-password"].$setViewValue(payload.mailPassword);
    $formController["mailbox-password"].$render();

    elements.submit().click();

    return {message: `${IpcRendererActions.Unlock.channel}: form submitted`};
});
