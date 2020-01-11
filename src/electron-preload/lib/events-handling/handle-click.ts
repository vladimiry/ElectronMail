import {IPC_MAIN_API} from "src/shared/api/main";
import {Logger} from "src/shared/model/common";
import {parsePackagedWebClientUrl} from "src/shared/util";
import {resolveLink} from "src/electron-preload/lib/events-handling/lib";

type ObservableElement = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

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

    const apiClient = IPC_MAIN_API.client({options: {logger}});
    const eventHandlerArgs: ["click", (event: MouseEvent) => Promise<void>] = [
        "click",
        async (event: MouseEvent) => await callDocumentClickEventListener(event, logger, apiClient),
    ];
    const [, eventHandler] = eventHandlerArgs;

    element.addEventListener(...eventHandlerArgs);

    subscription = {
        unsubscribe: () => {
            element.removeEventListener(...eventHandlerArgs);
            processedClickElements.delete(element);
        },
        eventHandler,
    };

    processedClickElements.set(element, subscription);

    return subscription;
}

export async function callDocumentClickEventListener<E extends Event = MouseEvent>(
    event: E,
    logger: Logger,
    apiClient?: ReturnType<typeof IPC_MAIN_API.client>,
) {
    const {element, link, href} = resolveLink(event.target as Element);

    if (!link || element.classList.contains("prevent-default-event")) {
        return;
    }

    if (!href) {
        return;
    }

    if (parsePackagedWebClientUrl(href)) {
        // allow click leading to "packaged web client" urls
        return;
    }

    event.preventDefault();

    if (!["https:", "http:"].includes(new URL(href).protocol)) {
        // completely skip non https/http links opening
        return;
    }

    // opening https/http links in external-program/browser
    const client = apiClient || IPC_MAIN_API.client({options: {logger}});
    const method = client("openExternal");
    await method({url: href});
}
