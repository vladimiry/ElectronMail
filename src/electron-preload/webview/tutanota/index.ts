import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {configureProviderApp} from "./configure-provider-app";
import {curryFunctionMembers} from "src/shared/util";
import {registerApi} from "./api";
import {registerDocumentKeyDownEventListener} from "src/shared/web/key-binding";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[index]");

configureProviderApp();

registerApi()
    .then(() => {
        _logger.verbose(`api registered, url: ${location.href}`);

        registerDocumentKeyDownEventListener(document, _logger);
    })
    .catch(_logger.error);
