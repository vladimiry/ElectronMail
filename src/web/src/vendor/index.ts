import "./index.scss";

// since Angular v5 "core-js/es7/reflect" is not needed for the AOT build (production), see webpack config for details
// import "core-js/es7/reflect";

import "./electron-webview-angular-fix.ts";
import "zone.js/dist/zone";

// TODO get rid of window.global exposing, required by "ng2-dragula"
(window as any).global = window;
