import {ApiMethod} from "electron-rpc-api";

import {APP_NAME} from "src/shared/constants";
import {LoginFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {ZoneApiParameter} from "src/shared/api/common";

export const channel = `${APP_NAME}:webview-api`;

export interface CommonApi {
    ping: ApiMethod<ZoneApiParameter, never>;
    fillLogin: ApiMethod<LoginFieldContainer & ZoneApiParameter, never>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter, never>;
    login2fa: ApiMethod<{ secret: string } & ZoneApiParameter, never>;
}
