import {app, Menu, Tray} from "electron";

import {Context} from "./model";
import {Endpoints} from "src/shared/api/main";
import {toggleBrowserWindow} from "./util";

export async function initTray(ctx: Context, endpoints: Endpoints): Promise<Tray> {
    const tray = new Tray(ctx.locations.trayIcon);
    const toggleWindow = () => toggleBrowserWindow(ctx);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Toggle Window",
            click: toggleWindow,
        },
        {
            label: "Open Settings Folder",
            async click() {
                await endpoints.openSettingsFolder().toPromise();
            },
        },
        {
            type: "separator",
        },
        {
            label: "About",
            async click() {
                await endpoints.openAboutWindow().toPromise();
            },
        },
        {
            type: "separator",
        },
        {
            label: "Quit",
            async click() {
                await endpoints.quit().toPromise();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("click", toggleWindow);

    app.on("before-quit", () => tray.destroy());

    return Promise.resolve(tray);
}
