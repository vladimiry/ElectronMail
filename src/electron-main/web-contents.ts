import _logger from "electron-log";
import {ContextMenuParams, Event, Menu, MenuItemConstructorOptions, WebContents, app, clipboard} from "electron";

import {Context} from "./model";
import {IPC_MAIN_API_NOTIFICATION$} from "./api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {PLATFORM} from "src/electron-main/constants";
import {buildSpellCheckSettingsMenuItems, buildSpellingSuggestionMenuItems} from "src/electron-main/spell-check/menu";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[web-contents]");

// WARN: needs to be called before "BrowserWindow" creating (has been ensured by tests)
export async function initWebContentsCreatingHandlers(ctx: Context) {
    interface Subscriptions {
        "context-menu": (event: Event, params: ContextMenuParams) => void;
        "update-target-url": (event: Event, url: string) => void;
        "preload-error": (event: Event, preloadPath: string, error: Error) => void;
        "will-attach-webview": (event: Event, webPreferences: any, params: any) => void;
    }

    const emptyArray = [] as const;
    const endpoints = await ctx.deferredEndpoints.promise;
    const spellCheckController = ctx.getSpellCheckController();
    const subscribe: (type: keyof Subscriptions, webContents: WebContents) => void = (() => {
        interface SubscriptionsCache extends Record<keyof Subscriptions, WeakMap<WebContents, Subscriptions[keyof Subscriptions]>> {
            "context-menu": WeakMap<WebContents, Subscriptions["context-menu"]>;
            "update-target-url": WeakMap<WebContents, Subscriptions["update-target-url"]>;
            "preload-error": WeakMap<WebContents, Subscriptions["preload-error"]>;
            "will-attach-webview": WeakMap<WebContents, Subscriptions["will-attach-webview"]>;
        }

        const handlersCache: Readonly<SubscriptionsCache> = {
            "context-menu": new WeakMap(),
            "update-target-url": new WeakMap(),
            "preload-error": new WeakMap(),
            "will-attach-webview": new WeakMap(),
        };

        const resultFunction: typeof subscribe = (eventName, webContents) => {
            const subscriptions: Readonly<Subscriptions> = {
                "context-menu": async (...[, {editFlags, linkURL, linkText, isEditable, selectionText}]) => {
                    const menuItems: MenuItemConstructorOptions[] = [];

                    if (linkURL) {
                        menuItems.push(
                            {
                                label: isEmailHref(linkURL) ? "Copy Email Address" : "Copy Link Address",
                                click() {
                                    if (PLATFORM === "darwin") {
                                        clipboard.writeBookmark(linkText, extractEmailIfEmailHref(linkURL));
                                    } else {
                                        clipboard.writeText(extractEmailIfEmailHref(linkURL));
                                    }
                                },
                            },
                        );
                    } else {
                        const checkSpelling = Boolean(spellCheckController.getCurrentLocale());
                        const misspelled = Boolean(
                            checkSpelling
                            &&
                            isEditable
                            &&
                            selectionText
                            &&
                            spellCheckController
                                .getSpellCheckProvider()
                                .isMisspelled(selectionText),
                        );

                        if (misspelled) {
                            menuItems.push(
                                ...buildSpellingSuggestionMenuItems(
                                    webContents,
                                    spellCheckController
                                        .getSpellCheckProvider()
                                        .getSuggestions(selectionText)
                                        .slice(0, 7),
                                ),
                            );
                        }

                        if (isEditable) {
                            menuItems.push(...[
                                ...(menuItems.length ? [{type: "separator"} as const] : emptyArray),
                                ...buildSpellCheckSettingsMenuItems(
                                    checkSpelling
                                        ? await spellCheckController.getAvailableDictionaries()
                                        : [],
                                    spellCheckController.getCurrentLocale(),
                                    async (locale) => {
                                        await endpoints.changeSpellCheckLocale({locale});
                                    },
                                ),
                            ]);
                        }

                        menuItems.push(...[
                            ...(menuItems.length ? [{type: "separator"} as const] : emptyArray),
                            ...[
                                // TODO use "role" based "cut/copy/paste" actions, currently these actions don't work properly
                                // keep track of the respective issue https://github.com/electron/electron/issues/15219
                                ...(editFlags.canCut ? [{label: "Cut", click: () => webContents.cut()}] : emptyArray),
                                ...(editFlags.canCopy ? [{label: "Copy", click: () => webContents.copy()}] : emptyArray),
                                ...(editFlags.canPaste ? [{label: "Paste", click: () => webContents.paste()}] : emptyArray),
                                ...(editFlags.canSelectAll ? [{label: "Select All", click: () => webContents.selectAll()}] : emptyArray),
                            ],
                        ]);
                    }

                    if (!menuItems.length) {
                        return;
                    }

                    Menu
                        .buildFromTemplate(menuItems)
                        .popup({});
                },
                "update-target-url": (...[, url]) => {
                    IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}));
                },
                "preload-error": (event, preloadPath, error) => {
                    logger.error(event.type, preloadPath, error);
                },
                "will-attach-webview": (() => {
                    const allowedPrefixes: readonly string[] = ctx.locations.webClients.map(({entryUrl}) => entryUrl);
                    const result: (typeof subscriptions)["will-attach-webview"] = (willAttachWebviewEvent, webPreferences, {src}) => {
                        const allowedSrc = allowedPrefixes.some((allowedPrefix) => src.startsWith(allowedPrefix));

                        webPreferences.nodeIntegration = false;

                        if (allowedSrc) {
                            return;
                        }

                        willAttachWebviewEvent.preventDefault();

                        const message = `Forbidden webview.src: "${allowedSrc}"`;
                        IPC_MAIN_API_NOTIFICATION$.next(
                            IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({message}),
                        );
                        logger.error(new Error(message));
                    };
                    return result;
                })(),
            };

            // TODO TS: get rid of any typecasting
            // TS doesn't allow yet narrowing the overloaded function implementations like based on argument types
            //      it always picks the latest overloaded function's declaration in the case of just trying referencing the function
            //      track the following related issues resolving:
            //          https://github.com/Microsoft/TypeScript/issues/26591
            //          https://github.com/Microsoft/TypeScript/issues/25352
            //      so for now we have to call "removeListener / on" explicitly for all the events
            (() => {
                const existingHandler = handlersCache[eventName].get(webContents);
                const handler = subscriptions[eventName];

                if (existingHandler) {
                    webContents.removeListener(eventName as any, existingHandler);
                }

                webContents.on(eventName as any, handler);

                handlersCache[eventName].set(webContents, handler as any);
            })();
        };

        return resultFunction;
    })();

    const webContentsCreatedHandler = (webContents: WebContents) => {
        subscribe("context-menu", webContents);
        subscribe("update-target-url", webContents);
        subscribe("preload-error", webContents);
        subscribe("will-attach-webview", webContents);
    };

    app.on("browser-window-created", (...[, {webContents}]) => webContentsCreatedHandler(webContents));
    app.on("web-contents-created", (...[, webContents]) => webContentsCreatedHandler(webContents));
}

function isEmailHref(href: string): boolean {
    return String(href).startsWith("mailto:");
}

function extractEmailIfEmailHref(href: string): string {
    return isEmailHref(href)
        ? String(href.split("mailto:").pop())
        : href;
}
