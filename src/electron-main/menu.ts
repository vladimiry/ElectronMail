import {Menu, MenuItemConstructorOptions, app} from "electron";
import {platform} from "os";

import {Endpoints} from "src/shared/api/main";

const staticDarwinItems: MenuItemConstructorOptions[] = [
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
];

export async function initApplicationMenu(endpoints: Endpoints): Promise<Menu> {
    const aboutItem: MenuItemConstructorOptions = {
        label: "About",
        async click() {
            await endpoints.openAboutWindow().toPromise();
        },
    };
    const quitItem: MenuItemConstructorOptions = {
        label: "Quit",
        async click() {
            await endpoints.quit().toPromise();
        },
    };
    const templateItems: MenuItemConstructorOptions[] = platform() === "darwin"
        ? [{
            label: app.getName(),
            submenu: [
                aboutItem,
                ...staticDarwinItems,
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
