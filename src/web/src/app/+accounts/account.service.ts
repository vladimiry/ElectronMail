import {Observable} from "rxjs/Observable";
import {Subscriber} from "rxjs/Subscriber";
import {forkJoin} from "rxjs/observable/forkJoin";
import {Injectable, NgZone} from "@angular/core";

import {IpcRendererActions} from "_shared/electron-actions";
import {WebAccountPageUrl} from "_shared/model/account";
import {ElectronService} from "../+core/electron.service";

@Injectable()
export class AccountService {
    // TODO timeout configuring
    readonly timeoutMs = 1000 * 5;

    constructor(private electronService: ElectronService,
                private zone: NgZone) {}

    notification(
        webView: any /* TODO switch to Electron.WebviewTag */,
        payload: IpcRendererActions.Notification.Type["i"],
        unSubscribeOn: Promise<any>,
    ) {
        return this.electronService.callIpcRenderer<IpcRendererActions.Notification.Type>(
            IpcRendererActions.Notification.channel, webView, payload, unSubscribeOn,
        );
    }

    fillLogin(
        webView: any /* TODO switch to Electron.WebviewTag */,
        payload: IpcRendererActions.FillLogin.Type["i"],
    ) {
        return this.electronService.callIpcRenderer<IpcRendererActions.FillLogin.Type>(
            IpcRendererActions.FillLogin.channel, webView, payload,
        );
    }

    login(
        webView: any /* TODO switch to Electron.WebviewTag */,
        payload: IpcRendererActions.Login.Type["i"],
    ) {
        return forkJoin(
            this.electronService.callIpcRenderer<IpcRendererActions.Login.Type>(
                IpcRendererActions.Login.channel, webView, payload,
            ),
            // this.didNavigateInPageObserver(
            //     webView,
            //     [WebAccountPageUrl.Unlock, WebAccountPageUrl.Inbox],
            //     {
            //         timeout: "Failed to login.",
            //         unexpectedPage: "Failed to login.",
            //     },
            // ),
        );
    }

    unlock(
        webView: any /* TODO switch to Electron.WebviewTag */,
        payload: IpcRendererActions.Unlock.Type["i"],
    ) {
        return forkJoin(
            this.electronService.callIpcRenderer<IpcRendererActions.Unlock.Type>(
                IpcRendererActions.Unlock.channel, webView, payload,
            ),
            // this.didNavigateInPageObserver(
            //     webView,
            //     [WebAccountPageUrl.Inbox],
            //     {
            //         timeout: "Failed to unlock.",
            //         unexpectedPage: "Failed to unlock.",
            //     },
            // ),
        );
    }

    // TODO make "didNavigateInPageObserver" work stable (it doesn't always work well with the unselected accounts - hidden webviews)
    private didNavigateInPageObserver<T extends { nextUrl: WebAccountPageUrl }>(
        webView: any /* TODO switch to Electron.WebviewTag */,
        expectedNextUrls: [WebAccountPageUrl],
        messages: {timeout: string, unexpectedPage: string},
    ): Observable<T> {
        return Observable.create((observer: Subscriber<T>) => {
            const communionChannel = "did-navigate-in-page";
            const listener = (event: any) => {
                const url: string = event.url;

                clearTimeout(timeoutHandle);
                webView.removeEventListener(communionChannel, listener);

                this.zone.run(() => {
                    const next = {
                        nextUrl: expectedNextUrls
                            .filter((expectedEnum) => expectedEnum.toString() === url)
                            .pop(),
                    } as T;

                    if (next.nextUrl) {
                        observer.next(next);
                        observer.complete();
                    } else {
                        observer.error(new Error(`${messages.unexpectedPage} Unexpected page loaded "${url}"`));
                    }
                });
            };
            const timeoutHandle = setTimeout(
                () => {
                    webView.removeEventListener(communionChannel, listener);

                    this.zone.run(() => {
                        observer.error(
                            new Error(`${messages.timeout} Communication timeout for channel ("${communionChannel}")`),
                        );
                        observer.complete();
                    });
                },
                this.timeoutMs,
            );

            webView.addEventListener(communionChannel, listener);
        });
    }
}
