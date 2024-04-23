import {applyZoomFactor, buildLoggerBundle} from "src/electron-preload/lib/util";
import {attachHoveredHrefHighlightElement} from "src/electron-preload/lib/hovered-href-highlighter";
import {exposeElectronStuffToWindow} from "src/electron-preload/lib/electron-exposure";
import {registerDocumentKeyDownEventListener} from "src/electron-preload/lib/events-handling";

const logger = buildLoggerBundle(__filename);

exposeElectronStuffToWindow();

registerDocumentKeyDownEventListener(document, logger);

attachHoveredHrefHighlightElement();

applyZoomFactor(logger);

if (BUILD_ENVIRONMENT === "e2e") {
    document.addEventListener("DOMContentLoaded", () => {
        const content = JSON.stringify({title: document.title, userAgent: window.navigator.userAgent});
        const stubElement = Object.assign(document.createElement("div"), {className: "e2e-stub-element", innerText: content});

        Object.assign(stubElement.style, {position: "fixed", top: "0", left: "0", color: "red"});

        document.body.appendChild(stubElement);
    });
}
