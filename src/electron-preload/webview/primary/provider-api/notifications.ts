import {Observable, ReplaySubject} from "rxjs";

import {FETCH_NOTIFICATION_SKIP_SYMBOL} from "./const";
import {ProtonApiError} from "src/electron-preload/webview/primary/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {curryFunctionMembers} from "src/shared/util";
import {sanitizeProtonApiError} from "src/electron-preload/lib/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[provider-api/notifications]");

// WARN: has to be initialized ASAP in page/js-code loading/evaluating life cycle
// since the app needs to be notified about all the fetch request
export const FETCH_NOTIFICATION$: Observable<Response> = (() => {
    // WARN: has to be replay subject since the app starts listening for fetch calls with some delay
    const subject = new ReplaySubject<Response>(100);
    const originalFetch = window.fetch;
    const overriddenFetch: typeof originalFetch = async function(this: typeof originalFetch, ...args) {
        const [firstArg, configArg] = args;
        const skipNotification = typeof configArg === "object" && FETCH_NOTIFICATION_SKIP_SYMBOL in configArg;

        if (skipNotification) {
            delete (configArg as unknown as { [FETCH_NOTIFICATION_SKIP_SYMBOL]?: unknown })[FETCH_NOTIFICATION_SKIP_SYMBOL];
        }

        const originalCallResult = originalFetch.apply(this, args);

        if (skipNotification) {
            const url = typeof firstArg === "string"
                ? firstArg
                : firstArg.url;
            logger.verbose("fetch notification skipped", JSON.stringify({url}));
        } else {
            originalCallResult
                .then((response) => {
                    if (response.ok) {
                        subject.next(response);
                    } else {
                        const protonApiError: ProtonApiError = {
                            name: "UnsuccessfulFetchRequest",
                            status: response.status,
                            response: {url: response.url},
                            message: `Unsuccessful fetch request notification: ${response.statusText}`,
                        };
                        logger.warn(
                            JSON.stringify(sanitizeProtonApiError(protonApiError)),
                        );
                    }
                })
                .catch((error) => {
                    logger.warn(sanitizeProtonApiError(error));
                });
        }

        return originalCallResult;
    };

    window.fetch = overriddenFetch;

    return subject.asObservable();
})();

// TODO consider making composer iframe adding detection reactive by listening for "react-components/components/editor/SquireIframe.tsx"
//      component mounting (more exactly by listening for calling "onReady" component prop)
export const IFRAME_NOTIFICATION$ = new Observable<{ iframeDocument: Document }>(
    (subscribe) => {
        const processAddedNode: (addedNode: Node | Element) => void = (addedNode) => {
            if (
                !("tagName" in addedNode)
                ||
                addedNode.tagName !== "DIV"
                ||
                !addedNode.classList.contains("composer")
                ||
                !addedNode.querySelector(".composer-container")
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
    },
);
