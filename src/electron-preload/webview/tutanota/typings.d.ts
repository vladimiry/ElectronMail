import {TutanotaWindow} from "src/electron-preload/webview/tutanota/types";

declare global {
    interface Window extends TutanotaWindow {}
}

declare var window: Window;
