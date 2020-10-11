import {applyZoomFactor, buildLoggerBundle} from "src/electron-preload/lib/util";
import {attachHoveredHrefHighlightElement} from "src/electron-preload/lib/hovered-href-highlighter";
import {exposeElectronStuffToWindow} from "src/electron-preload/lib/electron-exposure";
import {initSpellCheckProvider} from "src/electron-preload/lib/spell-check";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

const logger = buildLoggerBundle("[preload: browser-window]");

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(
    document,
    logger,
);

attachHoveredHrefHighlightElement();

initSpellCheckProvider(logger);

applyZoomFactor(logger);
