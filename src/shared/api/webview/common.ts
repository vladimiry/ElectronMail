import {ApiMethod, ApiMethodNoArgument} from "electron-rpc-api";

import {APP_NAME} from "src/shared/constants";
import {LoginFieldContainer, PasswordFieldContainer} from "src/shared/model/container";

export const channel = `${APP_NAME}:webview-api`;

export interface CommonApi {
    ping: ApiMethodNoArgument<never>;
    fillLogin: ApiMethod<LoginFieldContainer, never>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer, never>;
    login2fa: ApiMethod<{ secret: string }, never>;
}
