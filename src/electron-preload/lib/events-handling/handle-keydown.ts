import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {Logger} from "src/shared/model/common";
import {isPasswordInput, isWritable} from "src/electron-preload/lib/events-handling/lib";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";

type ObservableElement = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

const processedKeyDownElements
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    = new WeakMap<ObservableElement, ReturnType<typeof registerDocumentKeyDownEventListener>>();

const keyCodes = {
    A: 65,
    C: 67,
    V: 86,
    F: 70,
    F12: 123,
} as const;

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

    const apiClient = resolveIpcMainApi({logger});
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

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const el: Element | null = (
                event.target as any // eslint-disable-line @typescript-eslint/no-explicit-any
            );
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
