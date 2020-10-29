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

if (BUILD_ENVIRONMENT === "e2e") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).electronRequire = (
        name: string,
    ): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
        return name === "electron" // eslint-disable-line @typescript-eslint/no-unsafe-return
            ? require("electron") // eslint-disable-line @typescript-eslint/no-var-requires
            : require("electron").remote.require(name); // eslint-disable-line @typescript-eslint/no-var-requires
    };

    document.addEventListener("DOMContentLoaded", () => {
        const content = JSON.stringify({
            title: document.title,
            userAgent: window.navigator.userAgent,
        });
        const stubElement = Object.assign(
            document.createElement("div"),
            {
                className: "e2e-stub-element",
                innerText: content,
            },
        );

        Object.assign(
            stubElement.style,
            {
                position: "fixed",
                top: "0",
                left: "0",
                color: "red",
            },
        );

        document.body.appendChild(stubElement);
    });
}
