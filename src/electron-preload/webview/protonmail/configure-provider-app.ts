import {LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";
import {disableBrowserNotificationFeature, isBuiltInWebClient} from "src/electron-preload/webview/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, `[configure-angular-app]`);
const targetModuleName = "proton";
const imgSrcSanitizationWhitelistRe = new RegExp(`^\\s*((https?|ftp|file|blob|${LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN}):|data:image\\/)`);

export function configureProviderApp() {
    logger.info(`configureProviderApp()`, JSON.stringify({location: location.href}));

    disableBrowserNotificationFeature(logger);

    if (!isBuiltInWebClient()) {
        logger.info("configureProviderApp()", `No need for configuring the SPA as no built-in web client is used`);
        return;
    }

    configureAngularApp();
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

                if (creating && moduleName === targetModuleName) {
                    return tweakModule(result);
                }

                return result;
            };
        },
    });
}

function tweakModule(module: angular.IModule): typeof module {
    logger.info(`tweakModule()`);

    return module.config([
        "$compileProvider",
        ($compileProvider: angular.ICompileProvider) => {
            $compileProvider.imgSrcSanitizationWhitelist(imgSrcSanitizationWhitelistRe);
            logger.info(`"$compileProvider.imgSrcSanitizationWhitelist" called with "${imgSrcSanitizationWhitelistRe}" regexp`);
        },
    ]);
}
