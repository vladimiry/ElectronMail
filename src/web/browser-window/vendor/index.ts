import "zone.js/dist/zone";

import "src/web/browser-window/vendor/index.scss";
import "./electron-webview-angular-fix.ts";

if (!BUILD_ANGULAR_COMPILATION_FLAGS.aot) {
    require("core-js/proposals/reflect-metadata"); // tslint:disable-line:no-var-requires
}
