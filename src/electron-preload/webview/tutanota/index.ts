import {filter, take} from "rxjs/operators";
import {timer} from "rxjs";

import {ONE_SECOND_MS} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {configureProviderApp} from "./configure-provider-app";
import {curryFunctionMembers} from "src/shared/util";
import {registerApi} from "./api";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/key-binding";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[index]");

configureProviderApp();

timer(0, ONE_SECOND_MS).pipe(
    filter(() => navigator.onLine),
    take(1),
).subscribe(() => {
    registerApi()
        .then(() => {
            _logger.verbose(`api registered, url: ${location.href}`);
        })
        .catch(_logger.error);
});

registerDocumentKeyDownEventListener(document, _logger);
