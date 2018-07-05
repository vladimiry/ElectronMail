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
    const contextMenuEvenHandler = (e: Event, props: ContextMenuParams) => {
        const {selectionText, isEditable, linkURL} = props;
        const popupOptions: PopupOptions = {window: ctx.uiContext && ctx.uiContext.browserWindow};

        if (!popupOptions.window) {
            return;
        }

        if (isEditable) {
            inputMenu.popup(popupOptions);
            return;
        }

        if (linkURL) {
            Menu
                .buildFromTemplate([{
                    label: "Copy Link Address",
                    click() {
                        if (os.platform() === "darwin") {
                            clipboard.writeBookmark(props.linkText, props.linkURL);
                        } else {
                            clipboard.writeText(props.linkURL);
                        }
                    },
                }])
                .popup(popupOptions);
            return;
        }

        if (selectionText && selectionText.trim()) {
            selectionMenu.popup(popupOptions);
        }
    };
    const windowCreateHandler = (webContents: WebContents) => {
        webContents.removeListener("context-menu", contextMenuEvenHandler);
        webContents.on("context-menu", contextMenuEvenHandler);
    };

    app.on("browser-window-created", (event, {webContents}) => windowCreateHandler(webContents));
    app.on("web-contents-created", (webContentsCreatedEvent, webContents) => windowCreateHandler(webContents));
}
