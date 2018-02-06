import {app, clipboard, Menu} from "electron";

import {UIContext} from "./model";

export function initWebContentContextMenu(uiContext: UIContext) {
    app.on("web-contents-created", (webContentsCreatedEvent, contents) => {
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

        contents.on("context-menu", (e, props) => {
            const {selectionText, isEditable, linkURL} = props;

            if (isEditable) {
                inputMenu.popup(uiContext.browserWindow);
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
                    .popup(uiContext.browserWindow);
                return;
            }

            if (selectionText && selectionText.trim()) {
                selectionMenu.popup(uiContext.browserWindow);
            }
        });
    });
}
