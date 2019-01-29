import {ContextMenuParams, Event, Menu, MenuItemConstructorOptions, WebContents, app, clipboard} from "electron";
import {platform} from "os";

import {IPC_MAIN_API_NOTIFICATION$} from "./api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";

const emptyArray = Object.freeze([]);

const eventSubscriptions: {
    "context-menu": (event: Event, params: ContextMenuParams) => void;
    "update-target-url": (event: Event, url: string) => void;
} = {
    "context-menu": ({sender: webContents}: Event, {editFlags, linkURL, linkText}) => {
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
                ...(editFlags.canSelectAll ? [{label: "Select All", click: () => webContents.selectAll()}] : emptyArray),
            ]);
        }

        if (template.length) {
            Menu.buildFromTemplate(template).popup({});
        }
    },
    "update-target-url": (event, url) => {
        IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}));
    },
};

const webContentsCreatedHandler = (webContents: WebContents) => {
    Object
        .entries(eventSubscriptions)
        .map(([event, handler]) => {
            // TODO TS: get rid of any casting
            webContents.removeListener(event as any, handler);
            webContents.on(event as any, handler);
        });
};

// WARN: needs to be called before "BrowserWindow" creating
export function initWebContentsCreatingHandlers() {
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
