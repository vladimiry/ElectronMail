import {buildLoggerBundle} from "src/electron-preload/util";
import {exposeElectronStuffToWindow} from "src/electron-preload/electron-exposure";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/events-handling";

export const LOGGER = buildLoggerBundle("[preload: browser-window]");

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(
    document,
    LOGGER,
);
