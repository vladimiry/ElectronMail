import {attachHoveredHrefHighlightElement} from "src/electron-preload/lib/hovered-href-highlighter";
import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

export const LOGGER = buildLoggerBundle("[preload: about]");

registerDocumentKeyDownEventListener(document, LOGGER);
registerDocumentClickEventListener(document, LOGGER);

attachHoveredHrefHighlightElement();
