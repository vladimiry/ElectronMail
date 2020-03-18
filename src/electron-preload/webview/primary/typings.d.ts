import {ProtonWindow} from "src/electron-preload/webview/primary/types";

declare global {
    type Window = ProtonWindow
}

declare let window: Window;
