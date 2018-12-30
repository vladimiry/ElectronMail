import {__ELECTRON_EXPOSURE__} from "src/electron-preload/browser-window/electron-exposure";
import {registerDocumentKeyDownEventListener} from "src/shared/web/key-binding";

registerDocumentKeyDownEventListener(
    document,
    __ELECTRON_EXPOSURE__.__ELECTRON_EXPOSURE__.webLogger,
);
