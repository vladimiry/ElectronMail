import {buildLoggerBundle} from "src/electron-preload/util";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/electron-preload/events-handling";

export const LOGGER = buildLoggerBundle("[preload: about]");

registerDocumentKeyDownEventListener(document, LOGGER);
registerDocumentClickEventListener(document, LOGGER);
