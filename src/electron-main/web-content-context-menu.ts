import {ContextMenuParams, Event, Menu, MenuItemConstructorOptions, WebContents, app, clipboard} from "electron";
import {platform} from "os";

const emptyArray = Object.freeze([]);

const contextMenuEventSubscriptionArgs = [
    "context-menu",
    ({sender: webContents}: Event, {editFlags, linkURL, linkText}: ContextMenuParams) => {
        const template: MenuItemConstructorOptions[] = [];

        if (linkURL) {
            template.push({
                label: isEmailHref(linkURL) ? "Copy Email Address" : "Copy Link Address",
                click() {
                    if (platform() === "darwin") {
                        clipboard.writeBookmark(linkText, extractEmailIfEmailHref(linkURL));
                    } else {
                        clipboard.writeText(extractEmailIfEmailHref(linkURL));
                    }
                },
            });
        } else {
            template.push(...[
                // TODO use "role" based "cut/copy/paste" actions, currently these actions don't work properly
                // track the respective issue https://github.com/electron/electron/issues/15219
                ...(editFlags.canCut ? [{label: "Cut", click: () => webContents.cut()}] : emptyArray),
                ...(editFlags.canCopy ? [{label: "Copy", click: () => webContents.copy()}] : emptyArray),
                ...(editFlags.canPaste ? [{label: "Paste", click: () => webContents.paste()}] : emptyArray),
            ]);

            // TODO "selectall" context menu action doesn't work properly (works well only on login page)
            // if (editFlags.canSelectAll) {
            //     if (template.length) {
            //         template.push(separatorItem);
            //     }
            //     template.push({role: "selectall"});
            // }
        }

        if (template.length) {
            Menu.buildFromTemplate(template).popup({});
        }
    },
];

const webContentsCreatedHandler = (webContents: WebContents) => {
    webContents.removeListener.apply(webContents, contextMenuEventSubscriptionArgs);
    webContents.on.apply(webContents, contextMenuEventSubscriptionArgs);
};

export function initWebContentContextMenu() {
    app.on("browser-window-created", (event, {webContents}) => webContentsCreatedHandler(webContents));
    app.on("web-contents-created", (webContentsCreatedEvent, webContents) => webContentsCreatedHandler(webContents));
}

function isEmailHref(href: string): boolean {
    return String(href).startsWith("mailto:");
}

function extractEmailIfEmailHref(href: string): string {
    return isEmailHref(href) ? String(href.split("mailto:").pop()) : href;
}
