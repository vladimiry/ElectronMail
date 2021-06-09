import {Menu, MenuItemConstructorOptions, app} from "electron";

import {IpcMainApiEndpoints} from "src/shared/api/main";
import {PLATFORM} from "src/electron-main/constants";

// TODO crete "endpoints"-dependent menu items in disabled state and enable on "endpoints" promise resolving
export async function initApplicationMenu(endpoints: Promise<IpcMainApiEndpoints>): Promise<Menu> {
    const aboutItem: MenuItemConstructorOptions = {
        label: "About",
        async click() {
            await (await endpoints).openAboutWindow();
        },
    };
    const quitItem: MenuItemConstructorOptions = {
        label: "Quit",
        async click() {
            await (await endpoints).quit();
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
