import {NEVER, fromEvent, of, race, timer} from "rxjs";
import {mergeMap, take, tap} from "rxjs/operators";

import {EDITOR_IFRAME_NOTIFICATION$} from "./notifications";
import {IPC_MAIN_API} from "src/shared/api/main"; // tslint:disable-line:no-import-zones
import {LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN, ONE_SECOND_MS} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {applyZoomFactor} from "src/electron-preload/lib/util";
import {curryFunctionMembers, parsePackagedWebClientUrl, resolvePackagedWebClientApp} from "src/shared/util";
import {disableBrowserNotificationFeature, getLocationHref} from "src/electron-preload/webview/lib/util";
import {initSpellCheckProvider} from "src/electron-preload/lib/spell-check";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/shared-web/events-handling";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, `[configure-provider-app]`);

const angularWebClientOpts = Object.freeze({
    targetModuleName: "proton",
    imgSrcSanitizationWhitelistRe: new RegExp(`^\\s*((https?|ftp|file|blob|${LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN}):|data:image\\/)`),
});

export function configureProviderApp() {
    const logger = curryFunctionMembers(_logger, "configureProviderApp()");

    logger.info(JSON.stringify({locationHref: getLocationHref()}));

    initSpellCheckProvider(logger);
    applyZoomFactor(logger);
    disableBrowserNotificationFeature(logger);
    registerDocumentKeyDownEventListener(IPC_MAIN_API.client, document, logger);
    registerDocumentClickEventListener(IPC_MAIN_API.client, document, logger);

    const packagedWebClientUrl = parsePackagedWebClientUrl(getLocationHref());
    const isAngularWebClient = packagedWebClientUrl && resolvePackagedWebClientApp(packagedWebClientUrl).project === "WebClient";

    if (!isAngularWebClient) {
        logger.info(`Skip configuring AngularWebClient-specific stuff`);
        return;
    }

    logger.info(`Start configuring AngularWebClient-specific stuff`);

    configureAngularApp();

    EDITOR_IFRAME_NOTIFICATION$.subscribe(({iframeDocument}) => {
        registerDocumentKeyDownEventListener(IPC_MAIN_API.client, iframeDocument, logger);
        registerDocumentClickEventListener(IPC_MAIN_API.client, iframeDocument, logger);
    });

    EDITOR_IFRAME_NOTIFICATION$
        .pipe(
            mergeMap(({iframeDocument}) => {
                const $readyState = iframeDocument.readyState !== "loading"
                    ? of(iframeDocument).pipe(
                        tap(() => logger.verbose(`"iframeDocument" resolved: readyState "${iframeDocument.readyState}"`)),
                    )
                    : NEVER;
                return race(
                    timer(ONE_SECOND_MS).pipe(
                        tap(() => logger.verbose(`"iframeDocument" resolved: timer`)),
                    ),
                    $readyState,
                    fromEvent(iframeDocument, "DOMFrameContentLoaded").pipe(
                        tap(({type}) => logger.verbose(`"iframeDocument" resolved: "${type}" event`)),
                    ),
                    fromEvent(iframeDocument, "DOMContentLoaded").pipe(
                        tap(({type}) => logger.verbose(`"iframeDocument" resolved: "${type}" event`)),
                    ),
                ).pipe(
                    take(1),
                    // concatMap(() => [{iframeDocument}]),
                );
            }),
        )
        .subscribe((/*{iframeDocument}*/) => {
            initSpellCheckProvider(logger);
            applyZoomFactor(logger);
        });
}

function configureAngularApp() {
    type ValueType = angular.IAngularStatic;
    let value: ValueType | undefined;

    Object.defineProperty(window, "angular", {
        get: () => value,
        set(original: ValueType) {
            if (!value) {
                angularObjectWiredUpHandler(original);
            }
            value = original;
        },
    });
}

function angularObjectWiredUpHandler(
    // not the "angular.IAngularStatic" but "object" as an this point object is still empty (like no "module" method linked yet)
    angular: object,
) {
    _logger.info(`angularInitializedHandler()`);

    type ValueType = angular.IAngularStatic["module"];
    let value: ValueType | undefined;

    Object.defineProperty(angular, "module", {
        get: () => value,
        set(original: ValueType) {
            if (value) {
                return;
            }

            value = function(this: angular.IAngularStatic, ...args) {
                const [moduleName] = args;
                const creating = args.length > 1;
                const result = original.apply(this, args);

                if (creating && moduleName === angularWebClientOpts.targetModuleName) {
                    return tweakAngularModule(result);
                }

                return result;
            };
        },
    });
}

function tweakAngularModule(module: angular.IModule): typeof module {
    _logger.info(`tweakAngularModule()`);

    const {imgSrcSanitizationWhitelistRe} = angularWebClientOpts;

    return module.config([
        "$compileProvider",
        ($compileProvider: angular.ICompileProvider) => {
            $compileProvider.imgSrcSanitizationWhitelist(imgSrcSanitizationWhitelistRe);
            _logger.info(`"$compileProvider.imgSrcSanitizationWhitelist" called with "${imgSrcSanitizationWhitelistRe}" regexp`);
        },
    ]);
}
