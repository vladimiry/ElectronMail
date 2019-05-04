import {LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {
    callDocumentClickEventListener,
    registerDocumentClickEventListener,
    registerDocumentKeyDownEventListener,
} from "src/electron-preload/events-handling";
import {curryFunctionMembers} from "src/shared/util";
import {disableBrowserFetchFeature, disableBrowserNotificationFeature, isBuiltInWebClient} from "src/electron-preload/webview/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, `[configure-provider-app]`);
const angularOpts = Object.freeze({
    targetModuleName: "proton",
    imgSrcSanitizationWhitelistRe: new RegExp(`^\\s*((https?|ftp|file|blob|${LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN}):|data:image\\/)`),
});

export function configureProviderApp() {
    logger.info(`configureProviderApp()`, JSON.stringify({location: location.href}));

    // TODO figure how to make window.fetch work with Electron's custom protocols
    // disabling window.fetch as currently it's unsupported by Electron's custom protocols
    // so protonmail will use XMLHttpRequest based polyfill
    // see the commit caused a need to disable window.fetch:
    //     https://github.com/ProtonMail/WebClient/commit/532cec3814679cbbefdda704c00de22745948cbc#diff-9bdcd2e2ab4c086aa80d17b171b80e26
    disableBrowserFetchFeature(logger);

    disableBrowserNotificationFeature(logger);

    configureAngularApp();

    enableEventsProcessing();
}

function configureAngularApp() {
    if (!isBuiltInWebClient()) {
        logger.info("configureAngularApp()", `No need for configuring the SPA as no built-in web client is used`);
        return;
    }

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
    logger.info(`angularInitializedHandler()`);

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

                if (creating && moduleName === angularOpts.targetModuleName) {
                    return tweakModule(result);
                }

                return result;
            };
        },
    });
}

function tweakModule(module: angular.IModule): typeof module {
    logger.info(`tweakModule()`);

    const {imgSrcSanitizationWhitelistRe} = angularOpts;

    return module.config([
        "$compileProvider",
        ($compileProvider: angular.ICompileProvider) => {
            $compileProvider.imgSrcSanitizationWhitelist(imgSrcSanitizationWhitelistRe);
            logger.info(`"$compileProvider.imgSrcSanitizationWhitelist" called with "${imgSrcSanitizationWhitelistRe}" regexp`);
        },
    ]);
}

function enableEventsProcessing() {
    registerDocumentKeyDownEventListener(document, logger);
    registerDocumentClickEventListener(document, logger);

    // solves https://github.com/vladimiry/ElectronMail/issues/136 issue by processing unattached to DOM links clicking
    // see "openWindow" function in WebClient/src/helpers/browser.js:
    // https://github.com/ProtonMail/WebClient/blob/29b23c1fc754d32d0006647057899523c583b3a1/src/helpers/browser.js#L73
    document.createElement = (() => {
        const addRemoveClickEventArguments: ["click", typeof onceClickHandler] = ["click", onceClickHandler];
        const documentCreateElementOriginal = document.createElement;

        return function documentCreateElementOverridden(
            this: ReturnType<typeof document.createElement>,
        ) {
            const element = documentCreateElementOriginal.apply(this, arguments as any);

            if (narrowToHTMLLinkElement(element)) {
                element.addEventListener(...addRemoveClickEventArguments);
                // "element.click()" invoking is happening immediately so let's unsubscribe in the next event loop tick
                setTimeout(() => element.removeEventListener(...addRemoveClickEventArguments));
            }

            return element as any; // TODO TS: get rid of "any" type casting
        };

        async function onceClickHandler(this: HTMLLinkElement, event: MouseEvent) {
            if (this.isConnected) {
                return; // skip processing attached to DOM elements
            }

            await callDocumentClickEventListener(event, logger);
        }

        function narrowToHTMLLinkElement(element: Node): element is HTMLLinkElement {
            return element instanceof HTMLAnchorElement;
        }
    })();

    // message editing is happening inside an iframe
    // so we call "registerDocumentKeyDownEventListener" on every dynamically created editing iframe
    const processAddedNode: (addedNode: Node | Element) => void = (addedNode) => {
        if (
            !("tagName" in addedNode)
            || addedNode.tagName !== "DIV"
            || !addedNode.classList.contains("composer-editor")
            || !addedNode.classList.contains("angular-squire")
            || !addedNode.classList.contains("squire-container")
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

        registerDocumentKeyDownEventListener(iframeDocument, logger);
        registerDocumentClickEventListener(iframeDocument, logger);
    };

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(processAddedNode);
        }
    }).observe(
        document,
        {childList: true, subtree: true},
    );
}
