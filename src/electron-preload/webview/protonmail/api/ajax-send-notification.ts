import {Observable} from "rxjs";

import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[api/ajax-send-notification]");

export const AJAX_SEND_NOTIFICATION_SKIP_PARAM = `ajax-send-notification-skip-${Date.now()}`;

export const AJAX_SEND_NOTIFICATION$ = new Observable<XMLHttpRequest>((subscriber) => {
    const successHttpStatus = (status: number) => status >= 200 && status < 300;
    const ajaxSendNotificationSkipSymbol = Symbol(AJAX_SEND_NOTIFICATION_SKIP_PARAM);

    type XMLHttpRequestType = XMLHttpRequest & { [ajaxSendNotificationSkipSymbol]?: true };

    XMLHttpRequest.prototype.open = ((
        original = XMLHttpRequest.prototype.open,
        urlArgIndex = 1,
        removeAjaxNotificationSkipParamRe = new RegExp(`[\\?\\&]${AJAX_SEND_NOTIFICATION_SKIP_PARAM}=`),
    ) => function(this: XMLHttpRequestType) {
        const args = [...arguments];

        if (args.length && String(args[urlArgIndex]).indexOf(AJAX_SEND_NOTIFICATION_SKIP_PARAM) !== -1) {
            this[ajaxSendNotificationSkipSymbol] = true;
            args[urlArgIndex] = args[urlArgIndex].replace(removeAjaxNotificationSkipParamRe, "");
        }

        return original.apply(this, arguments as any);
    })();

    XMLHttpRequest.prototype.send = ((
        original = XMLHttpRequest.prototype.send,
        loadHandler = function(this: XMLHttpRequestType) {
            if (this[ajaxSendNotificationSkipSymbol]) {
                return;
            }

            if (successHttpStatus(this.status)) {
                subscriber.next(this);
                return;
            }

            logger.warn(
                "XMLHttpRequest error",
                JSON.stringify({status: this.status, statusText: this.statusText, responseURL: this.responseURL}),
            );
        },
        loadEndHandler = function(this: XMLHttpRequestType) {
            delete this[ajaxSendNotificationSkipSymbol];
            this.removeEventListener("load", loadHandler);
            this.removeEventListener("loadend", loadHandler);
        },
    ) => function(this: XMLHttpRequestType) {
        this.addEventListener("load", loadHandler);
        this.addEventListener("loadend", loadEndHandler);
        return original.apply(this, arguments as any);
    })();
});
