import {app, Menu, nativeImage, Tray} from "electron";

import {IpcMainActions} from "_shared/electron-actions";
import {Context, EndpointsMap} from "./model";

export async function initTray(ctx: Context, endpoints: EndpointsMap): Promise<Tray> {
    const tray = new Tray(nativeImage.createFromPath(ctx.locations.icon));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Toggle Window",
            click: () => ctx.emit("toggleBrowserWindow"),
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

    // tray.setToolTip("Toggle Window");
    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
        ctx.emit("toggleBrowserWindow");
    });

    app.on("before-quit", () => tray.destroy());

    return Promise.resolve(tray);
}
