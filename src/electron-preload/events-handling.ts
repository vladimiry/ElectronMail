import {IPC_MAIN_API} from "src/shared/api/main";
import {Logger} from "src/shared/types";

type ObservableElement = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

const processedKeyDownElements = new WeakMap<ObservableElement, ReturnType<typeof registerDocumentKeyDownEventListener>>();

export function registerDocumentKeyDownEventListener<E extends ObservableElement>(
    element: E,
    logger: Logger,
): {
    unsubscribe: () => void;
    eventHandler: (event: KeyboardEvent) => Promise<void>;
} {
    let subscription = processedKeyDownElements.get(element);

    if (subscription) {
        return subscription;
    }

    try {
        const apiClient = IPC_MAIN_API.buildClient();
        const apiMethods = {
            hotkey: apiClient("hotkey"),
            findInPageDisplay: apiClient("findInPageDisplay"),
        };
        const eventName = "keydown";
        const eventHandler = async (event: KeyboardEvent) => {
            const el: Element | null = (event.target as any);
            const cmdOrCtrl = event.ctrlKey || event.metaKey;

            const cmdOrCtrlPlusA = cmdOrCtrl && event.keyCode === 65;
            const cmdOrCtrlPlusC = cmdOrCtrl && event.keyCode === 67;
            const cmdOrCtrlPlusV = cmdOrCtrl && event.keyCode === 86;
            const cmdOrCtrlPlusF = cmdOrCtrl && event.keyCode === 70;

            if (cmdOrCtrlPlusF) {
                await apiMethods.findInPageDisplay({visible: true}).toPromise();
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

            await apiMethods.hotkey({type}).toPromise();
        };

        element.addEventListener(eventName, eventHandler);

        subscription = {
            unsubscribe: () => {
                element.removeEventListener(eventName, eventHandler);
                processedKeyDownElements.delete(element);
            },
            eventHandler,
        };

        processedKeyDownElements.set(element, subscription);

        return subscription;
    } catch (e) {
        logger.error(e);
        throw e;
    }
}

const processedClickElements = new WeakMap<ObservableElement, ReturnType<typeof registerDocumentClickEventListener>>();

export function registerDocumentClickEventListener<E extends ObservableElement>(
    element: E,
    logger: Logger,
): {
    unsubscribe: () => void;
    eventHandler: (event: MouseEvent) => Promise<void>;
} {
    let subscription = processedClickElements.get(element);

    if (subscription) {
        return subscription;
    }

    try {
        const apiClient = IPC_MAIN_API.buildClient();
        const apiMethods = {
            openExternal: apiClient("openExternal"),
        };
        const eventName = "click";
        const eventHandler = async (event: MouseEvent) => {
            const {element: el, link, href} = resolveLink(event.target as Element);

            if (!link || el.classList.contains("prevent-default-event")) {
                return;
            }

            event.preventDefault();

            if (
                !href
                ||
                !(href.startsWith("https://") || href.startsWith("http://"))
            ) {
                return;
            }

            await apiMethods.openExternal({url: href}).toPromise();
        };

        element.addEventListener(eventName, eventHandler);

        subscription = {
            unsubscribe: () => {
                element.removeEventListener(eventName, eventHandler);
                processedKeyDownElements.delete(element);
            },
            eventHandler,
        };

        processedClickElements.set(element, subscription);

        return subscription;
    } catch (e) {
        logger.error(e);
        throw e;
    }
}

function resolveLink(element: Element): { element: Element, link?: boolean; href?: string } {
    const parentScanState: {
        element: (Node & ParentNode) | null | Element;
        link?: boolean;
        iterationAllowed: number;
    } = {
        element,
        iterationAllowed: 3,
    };

    while (parentScanState.element && parentScanState.iterationAllowed) {
        if (
            parentScanState.element.nodeType === Node.ELEMENT_NODE
            &&
            ("tagName" in parentScanState.element && parentScanState.element.tagName.toLowerCase() === "a")
        ) {
            parentScanState.link = true;
            break;
        }
        parentScanState.element = parentScanState.element.parentNode;
        parentScanState.iterationAllowed--;
    }

    const result: ReturnType<typeof resolveLink> = {
        element: parentScanState.element as Element,
        link: parentScanState.link,
    };

    if (!result.link) {
        return result;
    }

    result.href = (result.element as HTMLLinkElement).href;

    return result;
}

function isInput(el: Element | HTMLInputElement): el is HTMLInputElement {
    return el.tagName === "INPUT";
}

function isTextarea(el: Element | HTMLTextAreaElement): el is HTMLTextAreaElement {
    return el.tagName === "TEXTAREA";
}

function isWritable(el: Element): boolean {
    const writableInput = (
        (isInput(el) || isTextarea(el))
        &&
        !el.disabled && !el.hasAttribute("disabled")
        &&
        !el.readOnly && !el.hasAttribute("readonly")
    );

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
    return (
        isInput(el)
        &&
        String(el.getAttribute("type")).toLowerCase() === "password"
    );
}
