import {app, Menu, Tray} from "electron";

import {Context} from "./model";
import {EndpointsMap} from "_shared/ipc-stream/main";
import {toggleBrowserWindow} from "./util";

export async function initTray(ctx: Context, endpoints: EndpointsMap): Promise<Tray> {
    const tray = new Tray(ctx.locations.trayIcon);
    const toggleWindow = () => toggleBrowserWindow(ctx);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Toggle Window",
            click: toggleWindow,
        },
        {
            label: "About",
            async click() {
                await endpoints.openAboutWindow(undefined).toPromise();
            },
        },
        {
            type: "separator",
        },
        {
            label: "Open Settings Folder",
            async click() {
                await endpoints.openSettingsFolder(undefined).toPromise();
            },
        },
        {
            type: "separator",
        },
        {
            label: "Quit",
            async click() {
                await endpoints.quit(undefined).toPromise();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("click", toggleWindow);

    app.on("before-quit", () => tray.destroy());

    return Promise.resolve(tray);
}
