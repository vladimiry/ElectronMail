import _logger from "electron-log";
import {BrowserWindow, Menu, MenuItemConstructorOptions, WebContents, app, clipboard} from "electron";
import {take} from "rxjs/operators";

import {Context} from "./model";
import {HOVERED_HREF_HIGHLIGHT_TAG_NAME} from "src/shared/constants";
import {IPC_MAIN_API_NOTIFICATION$} from "./api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {PLATFORM} from "src/electron-main/constants";
import {buildSpellCheckSettingsMenuItems, buildSpellingSuggestionMenuItems} from "src/electron-main/spell-check/menu";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[web-contents]");

// WARN: needs to be called before "BrowserWindow" creating (has been ensured by tests)
export async function initWebContentsCreatingHandlers(ctx: Context) {
    const emptyArray = [] as const;
    const endpoints = await ctx.deferredEndpoints.promise;
    const spellCheckController = ctx.getSpellCheckController();
    const allowedWebViewPrefixes: readonly string[] = ctx.locations.webClients.map(({entryUrl}) => entryUrl);
    const webContentsCreatedHandler = async (webContents: WebContents) => {
        webContents.on("context-menu", async (...[, {editFlags, linkURL, linkText, isEditable, selectionText}]) => {
            processIfHoveredHrefHighlightingBlockNotHovered(
                "context-menu",
                async () => {
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
            );
        });

        webContents.on("preload-error", (event, preloadPath, error) => {
            logger.error(event.type, preloadPath, error);
        });

        webContents.on("will-attach-webview", (willAttachWebviewEvent, webPreferences, {src}) => {
            const allowedSrc = allowedWebViewPrefixes.some((allowedPrefix) => src.startsWith(allowedPrefix));

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
        });

        // TODO debounce the "update-target-url" event processing or "distinctUntilChanged()" the "url" value
        //      empty "url" gets repeated frequently
        webContents.on("update-target-url", (...[, url]) => {
            if (url) {
                IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}));
                return;
            }
            processIfHoveredHrefHighlightingBlockNotHovered(
                "update-target-url",
                () => {
                    IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}));
                },
            );
        });

        const {zoomFactor} = await ctx.config$.pipe(take(1)).toPromise();
        webContents.zoomFactor = zoomFactor;
    };

    app.on("web-contents-created", (...[, webContents]) => webContentsCreatedHandler(webContents));
}

function processIfHoveredHrefHighlightingBlockNotHovered(
    cause: "context-menu" | "update-target-url",
    callback: () => void,
) {
    const webContents = BrowserWindow.getFocusedWindow()?.webContents;

    if (!webContents) {
        logger.warn("no focused window resolved", JSON.stringify({cause}));
        callback();
        return;
    }

    webContents
        .executeJavaScript(
            `([...document.querySelectorAll( ":hover" )].pop() || {tagName: null}).tagName`,
            true,
        )
        .then((tagName: string | null) => {
            if (String(tagName).toLowerCase() === HOVERED_HREF_HIGHLIGHT_TAG_NAME) {
                return;
            }
            callback();
        })
        .catch((error) => {
            const args = ["webContents.executeJavaScript", error] as const;
            console.log(...args); // tslint:disable-line:no-console
            logger.error(...args);
        });
}

function isEmailHref(href: string): boolean {
    return String(href).startsWith("mailto:");
}

function extractEmailIfEmailHref(href: string): string {
    return isEmailHref(href)
        ? String(href.split("mailto:").pop())
        : href;
}
