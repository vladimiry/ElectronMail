export function resolveLink(element: Element): { element: Element, link?: boolean; href?: string } {
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

export function isInput(el: Element | HTMLInputElement): el is HTMLInputElement {
    return el.tagName === "INPUT";
}

export function isTextarea(el: Element | HTMLTextAreaElement): el is HTMLTextAreaElement {
    return el.tagName === "TEXTAREA";
}

export function isWritable(el: Element): boolean {
    const writableInput = (
        (isInput(el) || isTextarea(el))
        &&
        !el.disabled && !el.hasAttribute("disabled")
        &&
        !el.readOnly && !el.hasAttribute("readonly")
    );

    return writableInput || isContentEditableDeep(el);
}

export function isContentEditableDeep(el: Node | Element | null): boolean {
    let value = false;

    while (el && !value) {
        value = "tagName" in el && isContentEditable(el);
        el = el.parentNode;
    }

    return value;
}

export function isContentEditable(el: Element): boolean {
    return el.hasAttribute("contenteditable");
}

export function isPasswordInput(el: Element): boolean {
    return (
        isInput(el)
        &&
        String(el.getAttribute("type")).toLowerCase() === "password"
    );
}
