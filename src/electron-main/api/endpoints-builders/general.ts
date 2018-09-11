import aboutWindow from "about-window";
import path from "path";
import {EMPTY, from, of} from "rxjs";
import {app, shell} from "electron";
import {isWebUri} from "valid-url";
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

        activateBrowserWindow: () => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

            if (!browserWindow) {
                return EMPTY;
            }

            browserWindow.show();
            browserWindow.focus();

            NOTIFICATION_SUBJECT.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow());

            return of(null);
        },

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

        notification: () => notificationObservable,
    };

    return endpoints;
}
