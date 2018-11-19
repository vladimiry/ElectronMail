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
    // {
    //     type: "separator",
    // },
    // {
    //     // TODO consider making "edit" app menu hidden as it's only needed to register the cut/copy/paste hotkeys on macOS
    //     label: "Edit",
    //     submenu: [
    //         // TODO use "role" based "cut/copy/paste" actions, currently these actions don't work properly
    //         // track the respective issue https://github.com/electron/electron/issues/15219
    //         {
    //             label: "Cut",
    //             accelerator: "CmdOrCtrl+X",
    //             // role: "cut",
    //             click: (menuItem, {webContents}) => {
    //                 webContents.cut();
    //             },
    //         },
    //         {
    //             label: "Copy",
    //             accelerator: "CmdOrCtrl+C",
    //             // role: "copy",
    //             click: (menuItem, {webContents}) => {
    //                 webContents.copy();
    //             },
    //         },
    //         {
    //             label: "Paste",
    //             accelerator: "CmdOrCtrl+V",
    //             // role: "paste",
    //             click: (menuItem, {webContents}) => {
    //                 webContents.paste();
    //             },
    //         },
    //     ],
    // },
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
