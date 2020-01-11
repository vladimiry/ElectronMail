import {attachHoveredHrefHighlightElement} from "src/electron-preload/lib/hovered-href-highlighter";
import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {exposeElectronStuffToWindow} from "src/electron-preload/lib/electron-exposure";
import {initSpellCheckProvider} from "src/electron-preload/lib/spell-check";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

export const LOGGER = buildLoggerBundle("[preload: browser-window]");

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(
    document,
    LOGGER,
);

attachHoveredHrefHighlightElement();

initSpellCheckProvider(LOGGER);
