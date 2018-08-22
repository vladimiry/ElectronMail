import {app, Menu, nativeImage, Tray} from "electron";

import {Endpoints} from "src/shared/api/main";

export function initTray(endpoints: Endpoints): Tray {
    const toggleWindow = () => endpoints.toggleBrowserWindow({}).toPromise();
    const tray = new Tray(nativeImage.createEmpty());

    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: "Toggle Window",
            async click() {
                await toggleWindow();
            },
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
    ]));

    tray.on("click", async () => {
        await toggleWindow();
    });

    app.on("before-quit", () => tray.destroy());

    return tray;
}
