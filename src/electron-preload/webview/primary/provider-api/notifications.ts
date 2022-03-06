import {Observable, ReplaySubject} from "rxjs";

import {curryFunctionMembers} from "src/shared/util";
import {FETCH_NOTIFICATION_SKIP_SYMBOL} from "./const";
import {ProtonApiError} from "src/electron-preload/webview/primary/types";
import {sanitizeProtonApiError} from "src/electron-preload/lib/util";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

type FETCH_NOTIFICATION$_Type = Observable<NoExtraProps<{ url: string; responseTextPromise: Promise<string> }>>;

// WARN: has to be initialized ASAP in page/js-code loading/evaluating life cycle
// since the app needs to be notified about all the fetch request
export const FETCH_NOTIFICATION$: FETCH_NOTIFICATION$_Type = (() => {
    // WARN: has to be replay subject since the app starts listening for fetch calls with some delay
    const subject = new ReplaySubject<Unpacked<FETCH_NOTIFICATION$_Type>>(100);
    const originalFetch = window.fetch;
    const overriddenFetch: typeof originalFetch = async function(this: typeof originalFetch, ...args) {
        const [firstArg, configArg] = args;
        const skipNotification = typeof configArg === "object" && FETCH_NOTIFICATION_SKIP_SYMBOL in configArg;

        if (skipNotification) {
            delete (configArg as unknown as { [FETCH_NOTIFICATION_SKIP_SYMBOL]?: unknown })[FETCH_NOTIFICATION_SKIP_SYMBOL];
        }

        const originalCallResult = originalFetch.apply(this, args);

        originalCallResult.catch((error) => {
            logger.warn(sanitizeProtonApiError(error));
        });

        return originalCallResult.then((originalResponse) => {
            const clonedResponse = originalResponse.clone();

            setTimeout(() => {
                if (skipNotification) {
                    const url = typeof firstArg === "string"
                        ? firstArg
                        : firstArg.url;
                    logger.verbose("fetch notification skipped", JSON.stringify({url}));
                    return;
                }

                if (clonedResponse.ok) {
                    subject.next({url: clonedResponse.url, responseTextPromise: clonedResponse.text()});
                } else {
                    const protonApiError: ProtonApiError = {
                        name: "UnsuccessfulFetchRequest",
                        status: clonedResponse.status,
                        response: {url: clonedResponse.url},
                        message: `Unsuccessful fetch request notification: ${clonedResponse.statusText}`,
                    };
                    logger.warn(sanitizeProtonApiError(protonApiError));
                }
            });

            return originalResponse;
        });
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
