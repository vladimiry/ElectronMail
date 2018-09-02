import aboutWindow from "about-window";
import path from "path";
import {BehaviorSubject, EMPTY, from, of} from "rxjs";
import {app, shell} from "electron";
import {isWebUri} from "valid-url";
import {promisify} from "util";

import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";

type ApiMethods =
    | "openAboutWindow"
    | "openExternal"
    | "openSettingsFolder"
    | "quit"
    | "activateBrowserWindow"
    | "toggleBrowserWindow"
    | "notification";
type NotificationOutput = Unpacked<ReturnType<Pick<Endpoints, "notification">["notification"]>>;

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, ApiMethods>> {
    const notificationSubject = new BehaviorSubject<NotificationOutput>({action: "activateBrowserWindow"});
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

            notificationSubject.next({action: "activateBrowserWindow"});

            return of(null);
        },

        toggleBrowserWindow: ({forcedState}) => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

            if (!browserWindow) {
                return EMPTY;
            }

            if (typeof forcedState !== "undefined" ? forcedState : !browserWindow.isVisible()) {
                endpoints.activateBrowserWindow();
            } else {
                browserWindow.hide();
            }

            return of(null);
        },

        notification: () => {
            return notificationSubject.asObservable();
        },
    };

    return endpoints;
}
