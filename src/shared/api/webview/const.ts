import {mapToObj} from "remeda";

import {PACKAGE_NAME} from "src/shared/const";

const IPC_WEBVIEW_API_CHANNELS = ["primary", "primary-login", "calendar"] as const;

export const IPC_WEBVIEW_API_CHANNELS_MAP = mapToObj(
    IPC_WEBVIEW_API_CHANNELS,
    (value) => [value, {communication: `${PACKAGE_NAME}:webview-api:${value}`, registered: `${value}:registered`}] as const,
);
