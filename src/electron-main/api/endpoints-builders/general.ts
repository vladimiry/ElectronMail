import aboutWindow from "about-window";
import path from "path";
import {EMPTY, from, of, throwError} from "rxjs";
import {IpcMainApiActionContext, IpcMainApiService} from "electron-rpc-api";
import {app, shell} from "electron";
import {isWebUri} from "valid-url";
import {platform} from "os";
import {promisify} from "util";

import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {NOTIFICATION_SUBJECT} from "src/electron-main/api/constants";

type ApiMethods =
    | "openAboutWindow"
    | "openExternal"
    | "openSettingsFolder"
    | "quit"
    | "activateBrowserWindow"
    | "toggleBrowserWindow"
    | "hotkey"
    | "selectAccount"
    | "notification";

const notificationObservable = NOTIFICATION_SUBJECT.asObservable();

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, ApiMethods>> {
    const endpoints: Pick<Endpoints, ApiMethods> = {
        openAboutWindow: () => {
            aboutWindow({
                icon_path: ctx.locations.icon,
                package_json_dir: path.join(ctx.locations.appDir, ".."),
            });
            return of(null);
        },

        openExternal: ({url}) => from((async () => {
            if (!isWebUri(url)) {
                throw new Error(`Forbidden url "${url}" opening has been prevented`);
            }

            await promisify(shell.openExternal)(url, {activate: true});

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

            NOTIFICATION_SUBJECT.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow());

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
                    (await ctx.endpoints.promise).findInPageStop().toPromise();
                    (await ctx.endpoints.promise).findInPageDisplay({visible: false}).toPromise();
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

        notification: () => notificationObservable,
    };

    return endpoints;
}
