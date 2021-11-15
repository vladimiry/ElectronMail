import {Subscription} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";

import {ElectronWindow} from "src/shared/model/electron";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {ofType} from "src/shared/ngrx-util-of-type";

const queryLinkElements: (
    shouldUseDarkColors: boolean,
    windowProxy: Exclude<HTMLIFrameElement["contentWindow"], null>,
) => HTMLLinkElement[] = (() => {
    const shouldUseDarkColorsBasedFileEndings = {
        "true": "-dark.css",
        "false": "-light.css",
    } as const;
    const result: typeof queryLinkElements = (shouldUseDarkColors, windowProxy) => {
        return Array.from(
            windowProxy.document.querySelectorAll<HTMLLinkElement>(
                `head > link[href$="${shouldUseDarkColorsBasedFileEndings[shouldUseDarkColors ? "true" : "false"]}"]`,
            ),
        );
    };
    return result;
})();

const applyTheming = (
    shouldUseDarkColors: boolean,
    windowProxy: Exclude<HTMLIFrameElement["contentWindow"], null>,
): void => {
    for (const linkElement of queryLinkElements(shouldUseDarkColors, windowProxy)) {
        linkElement.rel = "stylesheet";
    }
    for (const linkElement of queryLinkElements(!shouldUseDarkColors, windowProxy)) {
        const patch: Pick<typeof linkElement, "rel" | "as"> = {rel: "preload", as: "style"};
        Object.assign(linkElement, patch);
    }
};

export const registerNativeThemeReaction = (
    {buildIpcMainClient}: ElectronWindow["__ELECTRON_EXPOSURE__"],
    options?: {
        windowProxy?: Exclude<HTMLIFrameElement["contentWindow"], null>
        shouldUseDarkColors?: boolean
    },
): Subscription => {
    const subscription: Subscription = new Subscription();
    const windowProxy = options?.windowProxy ?? window;
    const shouldUseDarkColors = options?.shouldUseDarkColors;

    // TODO make sure cleanup actually gets well performed in all cases (browser window, about window, "search in page" window)
    const finishPromise = new Promise<void>((resolve) => {
        // TODO TS: remove type casting then TS gets support for extracting the arguments/parameters from the overloaded functions
        const handlers = [
            ["beforeunload", () => resolve],
            ["unload", () => resolve],
        ] as ReadonlyArray<Parameters<typeof window.addEventListener>>;
        for (const handler of handlers) {
            window.addEventListener(...handler);
            subscription.add({unsubscribe: () => window.removeEventListener(...handler)});
        }
    });

    subscription.add(
        buildIpcMainClient({options: {finishPromise}})("notification")()
            .pipe(
                ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.NativeTheme),
                map(({payload: {shouldUseDarkColors}}) => shouldUseDarkColors),
                distinctUntilChanged(),
            )
            .subscribe((shouldUseDarkColors) => applyTheming(shouldUseDarkColors, windowProxy)),
    );

    if (typeof shouldUseDarkColors === "boolean") {
        applyTheming(shouldUseDarkColors, windowProxy);
    }

    return subscription;
};
