import {NEVER, fromEvent, of, race, timer} from "rxjs";
import {mergeMap, take, tap} from "rxjs/operators";

import {EDITOR_IFRAME_NOTIFICATION$} from "./notifications";
import {LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN, ONE_SECOND_MS} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {applyZoomFactor} from "src/electron-preload/lib/util";
import {curryFunctionMembers, parsePackagedWebClientUrl, resolvePackagedWebClientApp} from "src/shared/util";
import {disableBrowserNotificationFeature} from "src/electron-preload/webview/lib/util";
import {initSpellCheckProvider} from "src/electron-preload/lib/spell-check";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, `[configure-provider-app]`);

const angularWebClientOpts = {
    targetModuleName: "proton",
    imgSrcSanitizationWhitelistRe: new RegExp(`^\\s*((https?|ftp|file|blob|${LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN}):|data:image\\/)`),
} as const;

function tweakAngularModule(module: angular.IModule): typeof module {
    _logger.info(`tweakAngularModule()`);

    const {imgSrcSanitizationWhitelistRe} = angularWebClientOpts;

    return module.config([
        "$compileProvider",
        ($compileProvider: angular.ICompileProvider) => {
            $compileProvider.imgSrcSanitizationWhitelist(imgSrcSanitizationWhitelistRe);
            _logger.info(`"$compileProvider.imgSrcSanitizationWhitelist" called with "${String(imgSrcSanitizationWhitelistRe)}" regexp`);
        },
    ]);
}

function angularObjectWiredUpHandler(
    // not the "angular.IAngularStatic" but "object" as an this point object is still empty (like no "module" method linked yet)
    angular: unknown,
): void {
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

function configureAngularApp(): void {
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

export function configureProviderApp(
    packagedWebClientUrl: Exclude<ReturnType<typeof parsePackagedWebClientUrl>, null>,
): void {
    const logger = curryFunctionMembers(_logger, "configureProviderApp()");

    initSpellCheckProvider(logger);
    applyZoomFactor(logger);
    registerDocumentKeyDownEventListener(document, logger);
    registerDocumentClickEventListener(document, logger);

    const packagedWebClientApp = resolvePackagedWebClientApp(packagedWebClientUrl);
    const isWebClient = packagedWebClientApp.project === "WebClient";
    logger.verbose(JSON.stringify({packagedWebClientApp, isWebClient}));

    if (!isWebClient) {
        logger.info(`Skip configuring AngularWebClient-specific stuff`);
        return;
    }

    // should be called for "WebClient" project only
    disableBrowserNotificationFeature(logger);

    logger.info(`Start configuring AngularWebClient-specific stuff`);

    configureAngularApp();

    EDITOR_IFRAME_NOTIFICATION$.subscribe(({iframeDocument}) => {
        registerDocumentKeyDownEventListener(iframeDocument, logger);
        registerDocumentClickEventListener(iframeDocument, logger);
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


