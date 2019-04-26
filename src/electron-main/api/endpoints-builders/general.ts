import electronLog from "electron-log";
import {EMPTY, from, of, throwError} from "rxjs";
import {IpcMainApiActionContext, IpcMainApiService} from "electron-rpc-api";
import {app, shell} from "electron";
import {isWebUri} from "valid-url";
import {map, startWith} from "rxjs/operators";
import {platform} from "os";

import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {showAboutBrowserWindow} from "src/electron-main/window/about";

type ApiMethods =
    | "log"
    | "openAboutWindow"
    | "openExternal"
    | "openSettingsFolder"
    | "quit"
    | "activateBrowserWindow"
    | "toggleBrowserWindow"
    | "hotkey"
    | "selectAccount"
    | "notification";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, ApiMethods>> {
    const endpoints: Pick<Endpoints, ApiMethods> = {
        log: (lines) => {
            for (const line of lines) {
                electronLog[line.level](...line.dataArgs);
            }

            return of(null);
        },

        openAboutWindow: () => {
            return from(showAboutBrowserWindow(ctx))
                .pipe(
                    map(() => null),
                );
        },

        openExternal: ({url}) => from((async () => {
            if (!isWebUri(url)) {
                throw new Error(`Forbidden url "${url}" opening has been prevented`);
            }

            await shell.openExternal(url, {activate: true});

            return null;
        })()),

        openSettingsFolder: () => {
            shell.openItem(ctx.locations.userDataDir);
            return of(null);
        },

        quit: () => {
            app.exit();
            return of(null);
        },

        activateBrowserWindow: () => from((async () => {
            const {window} = await ctx.configStore.readExisting();
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

            if (!browserWindow) {
                return EMPTY.toPromise();
            }

            if (window.maximized) {
                browserWindow.maximize();

                // above "maximize()" call is supposed to show the window, but sometimes it doesn't on some systems (especially macOS)
                if (!browserWindow.isVisible()) {
                    browserWindow.show();
                }
            } else {
                browserWindow.show();
            }

            browserWindow.focus();

            IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow());

            return null;
        })()),

        toggleBrowserWindow: ({forcedState}) => from((async () => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

            if (!browserWindow) {
                return EMPTY.toPromise();
            }

            if (typeof forcedState !== "undefined" ? forcedState : !browserWindow.isVisible()) {
                await endpoints.activateBrowserWindow().toPromise();
            } else {
                browserWindow.hide();
            }

            return null;
        })()),

        selectAccount(this: IpcMainApiActionContext, {databaseView, reset}) {
            return from((async () => {
                const [{sender: webContents}] = IpcMainApiService.resolveActionContext(this).args;

                const prevSelectedAccount = ctx.selectedAccount;
                const newSelectedAccount = reset
                    ? undefined
                    : {
                        webContentId: webContents.id,
                        databaseView,
                    };
                const needToCloseFindInPageWindow = (
                    // reset - no accounts in the list
                    !newSelectedAccount
                    ||
                    // TODO figure how to hide webview from search while in database view mode
                    //      webview can't be detached from DOM as it gets reloaded when reattached
                    //      search is not available in database view mode until then
                    newSelectedAccount.databaseView
                    ||
                    // changed selected account
                    prevSelectedAccount && prevSelectedAccount.webContentId !== newSelectedAccount.webContentId
                );

                if (needToCloseFindInPageWindow) {
                    await (await ctx.deferredEndpoints.promise).findInPageStop().toPromise();
                    await (await ctx.deferredEndpoints.promise).findInPageDisplay({visible: false}).toPromise();
                }

                ctx.selectedAccount = newSelectedAccount;

                return null;
            })());
        },

        hotkey(this: IpcMainApiActionContext, {type}) {
            const result = of(null);
            const [{sender: webContents}] = IpcMainApiService.resolveActionContext(this).args;

            if (platform() !== "darwin") {
                return result;
            }

            switch (type) {
                case "copy":
                    webContents.copy();
                    break;
                case "paste":
                    webContents.paste();
                    break;
                case "selectAll":
                    webContents.selectAll();
                    break;
                default:
                    return throwError(new Error(`Unknown hotkey "type" value:  "${type}"`));
            }

            return result;
        },

        notification: () => IPC_MAIN_API_NOTIFICATION$.asObservable().pipe(
            startWith(IPC_MAIN_API_NOTIFICATION_ACTIONS.Bootstrap({})),
        ),
    };

    return endpoints;
}
