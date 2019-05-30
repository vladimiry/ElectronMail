import _logger from "electron-log";
import {ContextMenuParams, Event, Menu, MenuItemConstructorOptions, WebContents, app, clipboard} from "electron";
import {platform} from "os";

import {ACCOUNTS_CONFIG, ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {Context} from "./model";
import {EntryUrlItem} from "src/shared/types";
import {FuzzyLocale} from "src/electron-main/spell-check/model";
import {IPC_MAIN_API_NOTIFICATION$} from "./api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {SPELL_CHECK_CONTROLLER} from "src/electron-main/spell-check/constants";
import {buildSpellCheckSettingsMenuItems, buildSpellingSuggestionMenuItems} from "src/electron-main/spell-check/menu";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[web-contents]");

// WARN: needs to be called before "BrowserWindow" creating (has been ensured by tests)
export async function initWebContentsCreatingHandlers(ctx: Context) {
    const emptyArray = [] as const;
    const endpoints = await ctx.deferredEndpoints.promise;
    const subscriptions: Readonly<{
        "context-menu": (event: Event, params: ContextMenuParams) => void;
        "update-target-url": (event: Event, url: string) => void;
        "will-attach-webview": (event: Event, webPreferences: any, params: any) => void;
    }> = {
        "context-menu": ({sender: webContents}: Event, {editFlags, linkURL, linkText, isEditable, selectionText}) => {
            const menuItems: MenuItemConstructorOptions[] = [];

            if (linkURL) {
                menuItems.push(
                    {
                        label: isEmailHref(linkURL) ? "Copy Email Address" : "Copy Link Address",
                        click() {
                            if (platform() === "darwin") {
                                clipboard.writeBookmark(linkText, extractEmailIfEmailHref(linkURL));
                            } else {
                                clipboard.writeText(extractEmailIfEmailHref(linkURL));
                            }
                        },
                    },
                );
            } else {
                const misspelled = Boolean(
                    isEditable
                    &&
                    selectionText
                    &&
                    SPELL_CHECK_CONTROLLER
                        .getSpellCheckProvider()
                        .isMisspelled(selectionText),
                );
                const spellingSuggestionMenuItems = misspelled
                    ? buildSpellingSuggestionMenuItems(
                        webContents,
                        SPELL_CHECK_CONTROLLER
                            .getSpellCheckProvider()
                            .getSuggestions(selectionText)
                            .slice(0, 7),
                    )
                    : [];
                const spellCheckSettingsMenuItems = buildSpellCheckSettingsMenuItems(
                    SPELL_CHECK_CONTROLLER.getAvailableDictionaries(),
                    SPELL_CHECK_CONTROLLER.getCurrentLocale(),
                    (fuzzyLocale: FuzzyLocale) => {
                        logger.info("selecting spellchecking language", fuzzyLocale);
                        SPELL_CHECK_CONTROLLER.changeLocale(fuzzyLocale);
                        endpoints.getSpellCheckMetadata()
                            .then(({locale}) => {
                                IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.Locale({locale}));
                            })
                            .catch(logger.error);
                    },
                );
                const editMenuItems: MenuItemConstructorOptions[] = [
                    // TODO use "role" based "cut/copy/paste" actions, currently these actions don't work properly
                    // keep track of the respective issue https://github.com/electron/electron/issues/15219
                    ...(editFlags.canCut ? [{label: "Cut", click: () => webContents.cut()}] : emptyArray),
                    ...(editFlags.canCopy ? [{label: "Copy", click: () => webContents.copy()}] : emptyArray),
                    ...(editFlags.canPaste ? [{label: "Paste", click: () => webContents.paste()}] : emptyArray),
                    ...(editFlags.canSelectAll ? [{label: "Select All", click: () => webContents.selectAll()}] : emptyArray),
                ];

                menuItems.push(...spellingSuggestionMenuItems);

                menuItems.push(...[
                    ...(menuItems.length ? [{type: "separator"} as const] : emptyArray),
                    ...spellCheckSettingsMenuItems,
                ]);

                menuItems.push(...[
                    ...(menuItems.length ? [{type: "separator"} as const] : emptyArray),
                    ...editMenuItems,
                ]);
            }

            if (!menuItems.length) {
                return;
            }

            Menu
                .buildFromTemplate(menuItems)
                .popup({});
        },
        "update-target-url": (event, url) => {
            IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}));
        },
        "will-attach-webview": (() => {
            const srcWhitelist: string[] = Object
                .values(ACCOUNTS_CONFIG)
                .reduce((list: EntryUrlItem[], {entryUrl}) => list.concat(entryUrl), [])
                .filter((item) => !item.value.startsWith(ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX))
                .map(({value}) => value)
                .concat(
                    Object
                        .values(ctx.locations.webClients)
                        .map((locationsMap) => Object.values(locationsMap))
                        .reduce((list: typeof entryUrls, entryUrls) => list.concat(entryUrls), [])
                        .map(({entryUrl}) => entryUrl),
                );
            const result: (typeof subscriptions)["will-attach-webview"] = (willAttachWebviewEvent, webPreferences, {src}) => {
                const allowedSrc = srcWhitelist.some((allowedPrefix) => src.startsWith(allowedPrefix));

                webPreferences.nodeIntegration = false;

                if (!allowedSrc) {
                    willAttachWebviewEvent.preventDefault();
                    logger.error(new Error(`Forbidden webview.src: "${allowedSrc}"`));
                }
            };

            return result;
        })(),
    };

    const webContentsCreatedHandler = (webContents: WebContents) => {
        // TODO TS doesn't allow yet narrowing the overloaded function implementations like based on argument types
        //      it always picks the latest overloaded function's declaration in the case of just trying referencing the function
        //      track the following related issues resolving:
        //          https://github.com/Microsoft/TypeScript/issues/26591
        //          https://github.com/Microsoft/TypeScript/issues/25352
        //      so for now we have to call "removeListener / on" explicitly for all the events
        let event: keyof typeof subscriptions | undefined;

        event = "context-menu";
        webContents.removeListener(event, subscriptions[event]);
        webContents.on(event, subscriptions[event]);

        event = "update-target-url";
        webContents.removeListener(event, subscriptions[event]);
        webContents.on(event, subscriptions[event]);

        event = "will-attach-webview";
        webContents.removeListener(event, subscriptions[event]);
        webContents.on(event, subscriptions[event]);
    };

    app.on("browser-window-created", (event, {webContents}) => webContentsCreatedHandler(webContents));
    app.on("web-contents-created", (webContentsCreatedEvent, webContents) => webContentsCreatedHandler(webContents));
}

function isEmailHref(href: string): boolean {
    return String(href).startsWith("mailto:");
}

function extractEmailIfEmailHref(href: string): string {
    return isEmailHref(href)
        ? String(href.split("mailto:").pop())
        : href;
}
