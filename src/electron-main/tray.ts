import {Menu, Tray, app, nativeImage} from "electron";

import {Context} from "src/electron-main/model";
import {VOID} from "src/shared/constants";

export async function initTray(ctx: Context): Promise<Tray> {
    const endpoints = await ctx.deferredEndpoints.promise;
    const toggleWindow = async () => await endpoints.toggleBrowserWindow.call(VOID, {});
    const tray = new Tray(nativeImage.createEmpty());

    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: "Toggle Window",
            click: toggleWindow,
        },
        {
            label: "Open Settings Folder",
            async click() {
                await endpoints.openSettingsFolder.call(VOID);
            },
        },
        {
            type: "separator",
        },
        {
            label: "About",
            async click() {
                await endpoints.openAboutWindow.call(VOID);
            },
        },
        {
            type: "separator",
        },
        {
            label: "Quit",
            async click() {
                await endpoints.quit.call(VOID);
            },
        },
    ]));

    tray.on("click", toggleWindow);

    app.on("before-quit", () => tray.destroy());

    return tray;
}
