import {app, clipboard, ContextMenuParams, Event, Menu, PopupOptions} from "electron";

import {Context} from "./model";

const selectionMenu = Menu.buildFromTemplate([
    {role: "copy", accelerator: "CmdOrCtrl+C"},
    {type: "separator"},
    {role: "selectall", accelerator: "CmdOrCtrl+A"},
]);
const inputMenu = Menu.buildFromTemplate([
    {role: "undo", accelerator: "CmdOrCtrl+Z"},
    {role: "redo", accelerator: "Shift+CmdOrCtrl+Z"},
    {type: "separator"},
    {role: "cut", accelerator: "CmdOrCtrl+X"},
    {role: "copy", accelerator: "CmdOrCtrl+C"},
    {role: "paste", accelerator: "CmdOrCtrl+V"},
    {type: "separator"},
    {role: "selectall", accelerator: "CmdOrCtrl+A"},
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
                        clipboard.writeText(linkURL);
                    },
                }])
                .popup(popupOptions);
            return;
        }

        if (selectionText && selectionText.trim()) {
            selectionMenu.popup(popupOptions);
        }
    };

    app.on("browser-window-created", (event, {webContents}) => {
        webContents.on("context-menu", contextMenuEvenHandler);
    });
    app.on("web-contents-created", (webContentsCreatedEvent, webContents) => {
        webContents.on("context-menu", contextMenuEvenHandler);
    });
}
