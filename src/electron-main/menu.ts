import {Menu, MenuItemConstructorOptions, app} from "electron";

import {Context} from "src/electron-main/model";
import {PLATFORM} from "src/electron-main/constants";

export async function initApplicationMenu(ctx: Context): Promise<Menu> {
    const endpoints = await ctx.deferredEndpoints.promise;
    const aboutItem: MenuItemConstructorOptions = {
        label: "About",
        async click() {
            await endpoints.openAboutWindow();
        },
    };
    const quitItem: MenuItemConstructorOptions = {
        label: "Quit",
        async click() {
            await endpoints.quit();
        },
    };
    const templateItems: MenuItemConstructorOptions[] = PLATFORM === "darwin"
        ? [{
            label: app.name,
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
                    role: "hideOthers",
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
