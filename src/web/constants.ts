import {BROWSER_WINDOW_RELATIVE_DESKTOP_NOTIFICATION_ICON, WEB_PROTOCOL_SCHEME} from "src/shared/const";
import ICON_URL from "src/assets/dist/icons/icon.png";

export {ICON_URL};

// TODO get rid of 8px constant (it's a app-custom sass's "spacer" value)
export const SPACER_PX = 8;

export const DESKTOP_NOTIFICATION_ICON_URL = `${WEB_PROTOCOL_SCHEME}://${BROWSER_WINDOW_RELATIVE_DESKTOP_NOTIFICATION_ICON}`;
