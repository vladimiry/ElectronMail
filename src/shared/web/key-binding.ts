import {IPC_MAIN_API} from "src/shared/api/main";
import {Logger} from "src/shared/types";

type ObservableElement = Pick<HTMLElement, "addEventListener">;

const processedElements = new WeakSet<ObservableElement>();

export function registerDocumentKeyDownEventListener<E extends ObservableElement>(
    element: E,
    logger: Logger,
) {
    if (processedElements.has(element)) {
        return;
    }

    try {
        const apiClient = IPC_MAIN_API.buildClient();
        const apiMethods = {
            hotkey: apiClient("hotkey"),
            findInPageDisplay: apiClient("findInPageDisplay"),
        };

        element.addEventListener("keydown", async (event) => {
            const el: Element | null = (event.target as any);
            const cmdOrCtrl = event.ctrlKey || event.metaKey;

            const cmdOrCtrlPlusA = cmdOrCtrl && event.keyCode === 65;
            const cmdOrCtrlPlusC = cmdOrCtrl && event.keyCode === 67;
            const cmdOrCtrlPlusV = cmdOrCtrl && event.keyCode === 86;
            const cmdOrCtrlPlusF = cmdOrCtrl && event.keyCode === 70;

            if (cmdOrCtrlPlusF) {
                apiMethods.findInPageDisplay({visible: true}).toPromise().catch(logger.error);
                return;
            }

            if (!el) {
                return;
            }

            let type: "copy" | "paste" | "selectAll" | undefined;

            if (cmdOrCtrlPlusA) {
                type = "selectAll";
            } else if (cmdOrCtrlPlusC && !isPasswordInput(el)) {
                type = "copy";
            } else if (cmdOrCtrlPlusV && isWritable(el)) {
                type = "paste";
            }

            if (!type) {
                return;
            }

            apiMethods.hotkey({type}).toPromise().catch(logger.error);
        });

        processedElements.add(element);
    } catch (e) {
        logger.error(e);
        throw e;
    }
}

function isInput(el: Element | HTMLInputElement): el is HTMLInputElement {
    return el.tagName === "INPUT";
}

function isTextarea(el: Element | HTMLTextAreaElement): el is HTMLTextAreaElement {
    return el.tagName === "TEXTAREA";
}

function isWritable(el: Element): boolean {
    const writableInput = (isInput(el) || isTextarea(el))
        && !el.disabled && !el.hasAttribute("disabled")
        && !el.readOnly && !el.hasAttribute("readonly");
    return writableInput || isContentEditableDeep(el);

}

function isContentEditableDeep(el: Node | Element | null): boolean {
    let value = false;
    while (el && !value) {
        value = "tagName" in el && isContentEditable(el);
        el = el.parentNode;
    }
    return value;
}

function isContentEditable(el: Element): boolean {
    return el.hasAttribute("contenteditable");
}

function isPasswordInput(el: Element): boolean {
    return isInput(el)
        && String(el.getAttribute("type")).toLowerCase() === "password";
}
