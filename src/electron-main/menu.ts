import {Menu, MenuItemConstructorOptions, app} from "electron";
import {platform} from "os";

import {Context} from "src/electron-main/model";
import {VOID} from "src/shared/constants";

export async function initApplicationMenu(ctx: Context): Promise<Menu> {
    const endpoints = await ctx.deferredEndpoints.promise;
    const aboutItem: MenuItemConstructorOptions = {
        label: "About",
        async click() {
            await endpoints.openAboutWindow.call(VOID);
        },
    };
    const quitItem: MenuItemConstructorOptions = {
        label: "Quit",
        async click() {
            await endpoints.quit.call(VOID);
        },
    };
    const templateItems: MenuItemConstructorOptions[] = platform() === "darwin"
        ? [{
            label: app.getName(),
            submenu: [
                aboutItem,
                {
                    type: "separator",
                },
                {
                    role: "hide",
                    accelerator: "Command+H",
                },
                {
                    role: "hideothers",
                    accelerator: "Command+Alt+H",
                },
                {
                    label: "Show All",
                    role: "unhide",
                },
                {
                    type: "separator",
                },
                quitItem,
            ],
        }]
        : [{
            label: "File",
            submenu: [
                quitItem,
            ],
        }];
    const menu = Menu.buildFromTemplate(templateItems);

    Menu.setApplicationMenu(menu);

    return menu;
}
