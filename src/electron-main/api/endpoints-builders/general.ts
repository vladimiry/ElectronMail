import aboutWindow from "about-window";
import path from "path";
import {app, shell} from "electron";
import {from, of} from "rxjs";
import {isWebUri} from "valid-url";
import {promisify} from "util";

import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {toggleBrowserWindow} from "src/electron-main/util";

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "openAboutWindow" | "openExternal" | "openSettingsFolder" | "quit" | "toggleBrowserWindow">> {

    return {
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

        toggleBrowserWindow: ({forcedState}) => {
            toggleBrowserWindow(ctx, forcedState);
            return of(null);
        },
    };
}
