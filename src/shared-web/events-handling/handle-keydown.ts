import {IPC_MAIN_API, IpcMainApiEndpoints} from "src/shared/api/main";
import {Logger} from "src/shared/model/common";
import {isPasswordInput, isWritable} from "src/shared-web/events-handling/lib";

type ObservableElement = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

const processedKeyDownElements = new WeakMap<ObservableElement, ReturnType<typeof registerDocumentKeyDownEventListener>>();

const keyCodes = {
    A: 65,
    C: 67,
    V: 86,
    F: 70,
    F12: 123,
} as const;

export function registerDocumentKeyDownEventListener<E extends ObservableElement>(
    buildIpcMainClient: typeof IPC_MAIN_API.client,
    element: E,
    logger: Logger,
): {
    unsubscribe: () => void;
    eventHandler: (event: KeyboardEvent) => Promise<void>;
} {
    if (Boolean(1)) {
        return {
            unsubscribe() {},
            async eventHandler() {},
        };
    }

    let subscription = processedKeyDownElements.get(element);

    if (subscription) {
        return subscription;
    }

    const apiClient = buildIpcMainClient({options: {logger}});
    const eventHandlerArgs: readonly ["keydown", (event: KeyboardEvent) => Promise<void>] = [
        "keydown",
        async (event: Readonly<KeyboardEvent>) => {
            if (event.keyCode === keyCodes.F12) {
                const {enableHideControlsHotkey} = await apiClient("readConfig")();

                if (enableHideControlsHotkey) {
                    await apiClient("toggleControls")();
                    return;
                }
            }

            const el: Element | null = (event.target as any);
            const cmdOrCtrl = event.ctrlKey || event.metaKey;

            if (!cmdOrCtrl) {
                return;
            }

            if (event.keyCode === keyCodes.F) {
                await apiClient("findInPageDisplay")({visible: true});
                return;
            }

            let type: Parameters<IpcMainApiEndpoints["hotkey"]>[0]["type"] | undefined;

            if (!el) {
                return;
            }

            if (event.keyCode === keyCodes.A) {
                type = "selectAll";
            } else if (event.keyCode === keyCodes.C && !isPasswordInput(el)) {
                type = "copy";
            } else if (event.keyCode === keyCodes.V && isWritable(el)) {
                type = "paste";
            }

            if (!type) {
                return;
            }

            await apiClient("hotkey")({type});
        },
    ];
    const [, eventHandler] = eventHandlerArgs;

    element.addEventListener(...eventHandlerArgs);

    subscription = {
        unsubscribe: () => {
            element.removeEventListener(...eventHandlerArgs);
            processedKeyDownElements.delete(element);
        },
        eventHandler,
    };

    processedKeyDownElements.set(element, subscription);

    return subscription;
}
