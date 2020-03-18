import {Menu, MenuItemConstructorOptions, Tray, app, nativeImage} from "electron";
import {Subscription} from "rxjs";
import {filter, tap} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";

export async function initTray(ctx: Context): Promise<Tray> {
    const endpoints = await ctx.deferredEndpoints.promise;
    const toggleBrowserWindow = async (): Promise<void> => endpoints.toggleBrowserWindow();
    const tray = new Tray(nativeImage.createEmpty());
    const optionsMenuItem: MenuItemConstructorOptions = {
        label: "Options",
        visible: false,
        async click() {
            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.OpenOptions(),
            );
            await endpoints.toggleBrowserWindow({forcedState: true});
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
                        await endpoints.openAboutWindow();
                    },
                },
                optionsMenuItem,
                {
                    label: "Open Settings Folder",
                    async click(): Promise<void> {
                        await endpoints.openSettingsFolder();
                    },
                },
                {
                    type: "separator",
                },
                logOutMenuItem,
                {
                    label: "Quit",
                    async click(): Promise<void> {
                        await endpoints.quit();
                    },
                },
            ]),
        );
    };
    const subscription = new Subscription();

    subscription.add(
        IPC_MAIN_API_NOTIFICATION$.pipe(
            filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.SignedInStateChange),
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
