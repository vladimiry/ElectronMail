import {app, Menu, Tray} from "electron";

import {IpcMainActions} from "_shared/electron-actions";
import {Context, EndpointsMap} from "./model";
import {toggleBrowserWindow} from "./util";

export async function initTray(ctx: Context, endpoints: EndpointsMap): Promise<Tray> {
    const tray = new Tray(ctx.locations.trayIcon);
    const toggleWindow = () => toggleBrowserWindow(ctx.uiContext);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Toggle Window",
            click: toggleWindow,
        },
        {
            label: "About",
            click: () => {
                endpoints[IpcMainActions.OpenAboutWindow.channel].process(undefined);
            },
        },
        {
            type: "separator",
        },
        {
            label: "Open Settings Folder",
            click() {
                endpoints[IpcMainActions.OpenSettingsFolder.channel].process(undefined);
            },
        },
        {
            type: "separator",
        },
        {
            label: "Quit",
            click() {
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("click", toggleWindow);

    app.on("before-quit", () => tray.destroy());

    return Promise.resolve(tray);
}
