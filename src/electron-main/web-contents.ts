import _logger from "electron-log";
import {BrowserWindow, Menu, MenuItemConstructorOptions, WebContents, app, clipboard, screen} from "electron";
import {take} from "rxjs/operators";

import {Context} from "./model";
import {IPC_MAIN_API_NOTIFICATION$} from "./api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {PLATFORM} from "src/electron-main/constants";
import {buildSpellCheckSettingsMenuItems, buildSpellingSuggestionMenuItems} from "src/electron-main/spell-check/menu";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[web-contents]");

function isEmailHref(href: string): boolean {
    return String(href).startsWith("mailto:");
}

function extractEmailIfEmailHref(href: string): string {
    return isEmailHref(href)
        ? String(href.split("mailto:").pop())
        : href;
}

// WARN: needs to be called before "BrowserWindow" creating (has been ensured by tests)
export async function initWebContentsCreatingHandlers(ctx: Context): Promise<void> {
    const emptyArray = [] as const;
    const endpoints = await ctx.deferredEndpoints.promise;
    const spellCheckController = ctx.getSpellCheckController();
    const allowedWebViewPrefixes: readonly string[] = ctx.locations.webClients.map(({entryUrl}) => entryUrl);
    const webContentsCreatedHandler = async (webContents: WebContents): Promise<void> => {
        webContents.on("context-menu", async (...[, {editFlags, linkURL, linkText, isEditable, selectionText}]) => {
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
                        ...(editFlags.canCut ? [{label: "Cut", click: (): void => webContents.cut()}] : emptyArray),
                        ...(editFlags.canCopy ? [{label: "Copy", click: (): void => webContents.copy()}] : emptyArray),
                        ...(editFlags.canPaste ? [{label: "Paste", click: (): void => webContents.paste()}] : emptyArray),
                        ...(editFlags.canSelectAll ? [{label: "Select All", click: (): void => webContents.selectAll()}] : emptyArray),
                    ],
                ]);
            }

            if (!menuItems.length) {
                return;
            }

            Menu
                .buildFromTemplate(menuItems)
                .popup({});
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

        webContents.on("update-target-url", (...[, url]) => {
            const focusedWindow = BrowserWindow.getFocusedWindow();

            if (!url || !focusedWindow) {
                IPC_MAIN_API_NOTIFICATION$.next(
                    IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}),
                );
                return;
            }

            const cursorScreenPoint = screen.getCursorScreenPoint();
            const focusedWindowBounds = focusedWindow.getBounds();

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({
                    url,
                    position: {
                        // TODO subtract width/height of devtools window
                        //      currenty devloots window should be closed/detached for percent size to be properly calculated
                        cursorXPercent: (cursorScreenPoint.x - focusedWindowBounds.x) / (focusedWindowBounds.width / 100),
                        // TODO take window titlebar into the account
                        cursorYPercent: (cursorScreenPoint.y - focusedWindowBounds.y) / (focusedWindowBounds.height / 100),
                    },
                }),
            );
        });

        const {zoomFactor} = await ctx.config$.pipe(take(1)).toPromise();
        webContents.zoomFactor = zoomFactor;
    };

    app.on("web-contents-created", async (...[, webContents]) => webContentsCreatedHandler(webContents));
}
