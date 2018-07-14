import aboutWindow from "about-window";
import path from "path";
import {app, shell} from "electron";
import {EMPTY, from} from "rxjs";
import {isWebUri} from "valid-url";
import {promisify} from "util";

import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {toggleBrowserWindow} from "src/electron-main/util";

export async function buildGeneralEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "openAboutWindow" | "openExternal" | "openSettingsFolder" | "quit" | "toggleBrowserWindow">> {

    return {
        openAboutWindow: () => {
            aboutWindow({
                icon_path: ctx.locations.icon,
                package_json_dir: path.join(ctx.locations.app, ".."),
            });
            return EMPTY;
        },

        openExternal: ({url}) => from((async () => {
            if (!isWebUri(url)) {
                throw new Error(`Forbidden url "${url}" opening has been prevented`);
            }

            await promisify(shell.openExternal)(url, {activate: true});

            return EMPTY.toPromise();
        })()),

        openSettingsFolder: () => {
            shell.openItem(ctx.locations.userData);
            return EMPTY;
        },

        quit: () => {
            app.exit();
            return EMPTY;
        },

        toggleBrowserWindow: ({forcedState}) => {
            toggleBrowserWindow(ctx, forcedState);
            return EMPTY;
        },
    };
}
