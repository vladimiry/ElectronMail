import os from "os";
import {app, clipboard, ContextMenuParams, Event, Menu, PopupOptions, WebContents} from "electron";

import {Context} from "./model";

const selectionMenu = Menu.buildFromTemplate([
    {role: "copy"},
    {type: "separator"},
    {role: "selectall"},
]);
const inputMenu = Menu.buildFromTemplate([
    {role: "undo"},
    {role: "redo"},
    {type: "separator"},
    {role: "cut"},
    {role: "copy"},
    {role: "paste"},
    {type: "separator"},
    {role: "selectall"},
]);

export function initWebContentContextMenu(ctx: Context) {
    const contextMenuEventArgs = [
        "context-menu",
        (e: Event, props: ContextMenuParams) => {
            const {selectionText, isEditable, linkURL, linkText} = props;
            const popupOptions: PopupOptions = {window: ctx.uiContext && ctx.uiContext.browserWindow};

            if (!popupOptions.window) {
                return;
            }

            if (isEditable) {
                inputMenu.popup(popupOptions);
                return;
            }

            if (linkURL) {
                const linkMenu = Menu.buildFromTemplate([{
                    label: isEmailHref(linkURL) ? "Copy Email Address" : "Copy Link Address",
                    click() {
                        const url = extractEmailIfEmailHref(linkURL);
                        if (os.platform() === "darwin") {
                            clipboard.writeBookmark(linkText, url);
                        } else {
                            clipboard.writeText(url);
                        }
                    },
                }]);
                linkMenu.popup(popupOptions);
                return;
            }

            if (selectionText && selectionText.trim()) {
                selectionMenu.popup(popupOptions);
            }
        },
    ];
    const webContentsCreatedHandler = (webContents: WebContents) => {
        webContents.removeListener.apply(webContents, contextMenuEventArgs);
        webContents.on.apply(webContents, contextMenuEventArgs);
    };

    app.on("browser-window-created", (event, {webContents}) => webContentsCreatedHandler(webContents));
    app.on("web-contents-created", (webContentsCreatedEvent, webContents) => webContentsCreatedHandler(webContents));
}

function isEmailHref(href: string): boolean {
    return String(href).startsWith("mailto:");
}

function extractEmailIfEmailHref(href: string): string {
    return isEmailHref(href) ? String(href.split("mailto:").pop()) : href;
}
