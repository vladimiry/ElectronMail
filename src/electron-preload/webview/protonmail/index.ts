import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {configureProviderApp} from "./configure-provider-app";
import {curryFunctionMembers} from "src/shared/util";
import {registerApi} from "./api";
import {registerDocumentKeyDownEventListener} from "src/shared/web/key-binding";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[index]");

configureProviderApp();

registerApi();

(() => {
    registerDocumentKeyDownEventListener(document, _logger);

    // message editing is happening inside an iframe
    // so we call "registerDocumentKeyDownEventListener" on every dynamically created editing iframe
    const processAddedNode: (node: Node | Element) => void = (node) => {
        if (
            !("tagName" in node)
            || node.tagName !== "DIV"
            || !node.classList.contains("composer-editor")
            || !node.classList.contains("angular-squire")
            || !node.classList.contains("squire-container")
        ) {
            return;
        }
        const iframe = node.querySelector("iframe");
        const iframeDocument = iframe && (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document));
        if (!iframeDocument) {
            return;
        }
        registerDocumentKeyDownEventListener(iframeDocument, _logger);
    };
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(processAddedNode);
        }
    }).observe(document, {childList: true, subtree: true});
})();
