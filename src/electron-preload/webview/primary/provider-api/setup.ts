import {first, mergeMap, tap} from "rxjs/operators";
import {fromEvent, NEVER, of, race, timer} from "rxjs";

import {applyZoomFactor} from "src/electron-preload/lib/util";
import {curryFunctionMembers} from "src/shared/util";
import {disableBrowserNotificationFeature} from "src/electron-preload/webview/lib/util";
import {IFRAME_NOTIFICATION$} from "src/electron-preload/webview/primary/provider-api/notifications";
import {ONE_SECOND_MS} from "src/shared/const";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";
import {testProtonMailAppPage} from "src/shared/util/proton-webclient";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

export const setupProviderIntegration = (
    {shouldDisableBrowserNotificationFeature, blankHtmlPage}: ReturnType<typeof testProtonMailAppPage>,
): void => {
    const logger = curryFunctionMembers(_logger, nameof(setupProviderIntegration));

    if (blankHtmlPage) {
        logger.info("skipped");
        return;
    }

    applyZoomFactor(logger);
    registerDocumentKeyDownEventListener(document, logger);
    registerDocumentClickEventListener(document, logger);

    if (shouldDisableBrowserNotificationFeature) {
        disableBrowserNotificationFeature(logger);
    }

    IFRAME_NOTIFICATION$.subscribe((iframeDocument) => {
        registerDocumentKeyDownEventListener(iframeDocument, logger);
        registerDocumentClickEventListener(iframeDocument, logger);
    });

    IFRAME_NOTIFICATION$.pipe(mergeMap((iframeDocument) => {
        const $readyState = iframeDocument.readyState !== "loading"
            ? of(iframeDocument).pipe(tap(() => logger.verbose(`"iframeDocument" resolved: readyState "${iframeDocument.readyState}"`)))
            : NEVER;
        return race(
            timer(ONE_SECOND_MS).pipe(tap(() => logger.verbose(`"iframeDocument" resolved: timer`))),
            $readyState,
            fromEvent(iframeDocument, "DOMFrameContentLoaded").pipe(
                tap(({type}) => logger.verbose(`"iframeDocument" resolved: "${type}" event`)),
            ),
            fromEvent(iframeDocument, "DOMContentLoaded").pipe(
                tap(({type}) => logger.verbose(`"iframeDocument" resolved: "${type}" event`)),
            ),
        ).pipe(
            first(),
            // concatMap(() => [{iframeDocument}]),
        );
    })).subscribe((/*{iframeDocument}*/) => {
        applyZoomFactor(logger);
    });
};
