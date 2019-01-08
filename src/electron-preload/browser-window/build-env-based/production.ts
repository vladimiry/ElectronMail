import {ELECTRON_WINDOW} from "src/electron-preload/browser-window/electron-exposure";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/key-binding";

registerDocumentKeyDownEventListener(
    document,
    ELECTRON_WINDOW.__ELECTRON_EXPOSURE__.webLogger,
);
