import {ElectronWindow} from "src/shared/model/electron";
import {IPC_MAIN_API} from "src/shared/api/main";
import {buildLoggerBundle} from "src/electron-preload/util";

// tslint:disable-next-line:no-eval
const _require = eval("require");

export const ELECTRON_WINDOW: ElectronWindow = {
    __ELECTRON_EXPOSURE__: {
        buildLoggerBundle,
        buildIpcMainClient: IPC_MAIN_API.buildClient.bind(IPC_MAIN_API),
        require: {
            "rolling-rate-limiter": () => _require("rolling-rate-limiter"),
        },
    },
};

export function exposeElectronStuffToWindow(): ElectronWindow {
    Object.assign(window, ELECTRON_WINDOW);
    return ELECTRON_WINDOW;
}
