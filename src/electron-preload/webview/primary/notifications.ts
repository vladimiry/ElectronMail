import {Observable} from "rxjs";

import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {curryFunctionMembers} from "src/shared/util";
import {depersonalizeLoggedUrl} from "src/electron-preload/webview/primary/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[notifications]");

export const AJAX_SEND_NOTIFICATION_SKIP_PARAM = `ajax-send-notification-skip-${Date.now()}`;

export const AJAX_SEND_NOTIFICATION$ = new Observable<XMLHttpRequest>((subscriber) => {
    const successHttpStatus = (status: number): boolean => status >= 200 && status < 300;
    const ajaxSendNotificationSkipSymbol = Symbol(AJAX_SEND_NOTIFICATION_SKIP_PARAM);

    type XMLHttpRequestType = XMLHttpRequest & { [ajaxSendNotificationSkipSymbol]?: true };

    XMLHttpRequest.prototype.open = (
        () => {
            const original = XMLHttpRequest.prototype.open;
            const urlArgIndex = 1;
            const removeAjaxNotificationSkipParamRe = new RegExp(`[\\?\\&]${AJAX_SEND_NOTIFICATION_SKIP_PARAM}=`);
            return function(
                this: XMLHttpRequestType,
                ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
            ) {
                if (args.length && String(args[urlArgIndex]).includes(AJAX_SEND_NOTIFICATION_SKIP_PARAM)) {
                    this[ajaxSendNotificationSkipSymbol] = true;
                    args[urlArgIndex] = String(args[urlArgIndex]).replace(removeAjaxNotificationSkipParamRe, "");
                }
                return original.apply(this, args as Parameters<typeof original>);
            };
        }
    )();

    XMLHttpRequest.prototype.send = (
        () => {
            const original = XMLHttpRequest.prototype.send;
            const loadHandler = function(this: XMLHttpRequestType): void {
                if (this[ajaxSendNotificationSkipSymbol]) {
                    return;
                }
                if (successHttpStatus(this.status)) {
                    subscriber.next(this);
                    return;
                }
                logger.warn(
                    "XMLHttpRequest error",
                    JSON.stringify({
                        status: this.status,
                        statusText: this.statusText,
                        responseURL: depersonalizeLoggedUrl(this.responseURL),
                    }),
                );
            };
            const loadEndHandler = function(this: XMLHttpRequestType): void {
                delete this[ajaxSendNotificationSkipSymbol];
                this.removeEventListener("load", loadHandler);
                this.removeEventListener("loadend", loadHandler);
            };
            return function(this: XMLHttpRequestType, ...args: Parameters<typeof original>) {
                this.addEventListener("load", loadHandler);
                this.addEventListener("loadend", loadEndHandler);
                return original.apply(this, args);
            };
        }
    )();
});

export const EDITOR_IFRAME_NOTIFICATION$ = new Observable<{ iframeDocument: Document }>((subscribe) => {
    const processAddedNode: (addedNode: Node | Element) => void = (addedNode) => {
        if (
            !("tagName" in addedNode)
            || addedNode.tagName !== "DIV"
            || !addedNode.classList.contains("composer")
            || !addedNode.classList.contains("composer-container")
        ) {
            return;
        }

        const iframe = addedNode.querySelector("iframe");
        const iframeDocument = (
            iframe
            &&
            (
                iframe.contentDocument
                ||
                (iframe.contentWindow && iframe.contentWindow.document)
            )
        );

        if (!iframeDocument) {
            return;
        }

        subscribe.next({iframeDocument});
    };

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(processAddedNode);
        }
    }).observe(
        document,
        {childList: true, subtree: true},
    );
});
