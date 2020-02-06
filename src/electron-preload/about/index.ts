import {IPC_MAIN_API} from "src/shared/api/main";
import {attachHoveredHrefHighlightElement} from "src/electron-preload/lib/hovered-href-highlighter";
import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {registerDocumentClickEventListener, registerDocumentKeyDownEventListener} from "src/shared-web/events-handling";

export const LOGGER = buildLoggerBundle("[preload: about]");

registerDocumentKeyDownEventListener(IPC_MAIN_API.client, document, LOGGER);
registerDocumentClickEventListener(IPC_MAIN_API.client, document, LOGGER);

attachHoveredHrefHighlightElement();
