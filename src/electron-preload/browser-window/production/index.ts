import {IPC_MAIN_API} from "src/shared/api/main";
import {applyZoomFactor, buildLoggerBundle} from "src/electron-preload/lib/util";
import {exposeElectronStuffToWindow} from "src/electron-preload/lib/electron-exposure";
import {initSpellCheckProvider} from "src/electron-preload/lib/spell-check";
import {registerDocumentKeyDownEventListener} from "src/shared-web/events-handling";

export const LOGGER = buildLoggerBundle("[preload: browser-window]");

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(
    IPC_MAIN_API.client,
    document,
    LOGGER,
);

// attachHoveredHrefHighlightElement();

initSpellCheckProvider(LOGGER);

applyZoomFactor(LOGGER);
