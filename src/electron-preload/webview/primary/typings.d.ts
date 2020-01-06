import {ProtonWindow} from "src/electron-preload/webview/primary/types";

declare global {
    interface Window extends ProtonWindow {}
}

declare var window: Window;
