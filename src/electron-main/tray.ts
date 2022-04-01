import {app, Menu, MenuItemConstructorOptions, nativeImage, Tray} from "electron";
import {Subscription} from "rxjs";
import {tap} from "rxjs/operators";

import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {ofType} from "src/shared/ngrx-util-of-type";

// TODO crete "endpoints"-dependent menu items in disabled state and enable on "endpoints" promise resolving
export async function initTray(endpoints: Promise<IpcMainApiEndpoints>): Promise<Tray> {
    const toggleBrowserWindow = async (): Promise<void> => (await endpoints).toggleBrowserWindow();
    const tray = new Tray(nativeImage.createEmpty());
    const optionsMenuItem: MenuItemConstructorOptions = {
        label: "Options",
        visible: false,
        async click() {
            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.OpenOptions(),
            );
            await (await endpoints).toggleBrowserWindow({forcedState: true});
        },
    };
    const logOutMenuItem: MenuItemConstructorOptions = {
        label: "Log Out",
        visible: false,
        click() {
            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.LogOut(),
            );
        },
    };
    const setContextMenu = (): void => {
        tray.setContextMenu(
            Menu.buildFromTemplate([
                {
                    label: "Toggle Window",
                    click: toggleBrowserWindow,
                },
                {
                    type: "separator",
                },
                {
                    label: "About",
                    async click(): Promise<void> {
                        await (await endpoints).openAboutWindow();
                    },
                },
                optionsMenuItem,
                {
                    label: "Open Settings Folder",
                    async click(): Promise<void> {
                        await (await endpoints).openSettingsFolder();
                    },
                },
                {
                    type: "separator",
                },
                logOutMenuItem,
                {
                    label: "Quit",
                    async click(): Promise<void> {
                        await (await endpoints).quit();
                    },
                },
            ]),
        );
    };
    const subscription = new Subscription();

    subscription.add(
        IPC_MAIN_API_NOTIFICATION$.pipe(
            ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.SignedInStateChange),
            tap(({payload: {signedIn}}) => {
                optionsMenuItem.visible = signedIn;
                logOutMenuItem.visible = signedIn;
            }),
        ).subscribe(
            // we have to re-create the entire menu since electron doesn't support dynamic menu items change
            // like for example changing "visible" menu items property
            setContextMenu,
        ),
    );

    setContextMenu();

    tray.on("click", toggleBrowserWindow);

    app.on("before-quit", () => {
        subscription.unsubscribe();
        tray.destroy();
    });

    return tray;
}
