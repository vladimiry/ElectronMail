import {IPC_MAIN_API} from "src/shared/api/main";
import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {exposeElectronStuffToWindow} from "src/electron-preload/lib/electron-exposure";
import {registerDocumentKeyDownEventListener} from "src/shared-web/events-handling";

export const LOGGER = buildLoggerBundle("[preload: search-in-page-browser-view]");

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(
    IPC_MAIN_API.client,
    document,
    LOGGER,
);
