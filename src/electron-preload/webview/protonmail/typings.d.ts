import {ProtonmailWindow} from "src/electron-preload/webview/protonmail/types";

declare global {
    interface Window extends ProtonmailWindow {}
}

declare var window: Window;
