import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {exposeElectronStuffToWindow} from "src/electron-preload/lib/electron-exposure";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

export const LOGGER = buildLoggerBundle(__filename);

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(document, LOGGER);
