//  https://github.com/electron/electron/issues/10176

const originalRemoveEventListener = window.removeEventListener;

function needToCallOriginalMethod(name: string, listenerFunctionStringified: string): boolean {
    return (
        name === "readystatechange"
        &&
        listenerFunctionStringified.includes("registerBrowserPluginElement()")
        &&
        listenerFunctionStringified.includes("registerWebViewElement()")
    );
}

function removeEventListenerOverloaded(
    this: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ...args: [string /* name */, EventListenerOrEventListenerObject, ...any[]] // eslint-disable-line @typescript-eslint/no-explicit-any
): void {
    const [name, listener] = args;

    if (listener && needToCallOriginalMethod(name, listener.toString())) {
        // calling native/original implementation
        return originalRemoveEventListener.apply(
            this,
            args as Parameters<typeof originalRemoveEventListener>,
        );
    }

    // calling implementation patched by Zone.js
    return EventTarget.prototype.removeEventListener.apply(
        this,
        args as Parameters<typeof EventTarget.prototype.removeEventListener>,
    );
}

window.removeEventListener = removeEventListenerOverloaded;
