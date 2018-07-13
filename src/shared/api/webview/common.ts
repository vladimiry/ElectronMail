import {ApiMethod, ApiMethodNoArgument} from "electron-rpc-api";

import {LoginFieldContainer, PasswordFieldContainer} from "_@shared/model/container";

export const channel = `${process.env.APP_ENV_PACKAGE_NAME}:webview-api`;

export interface CommonApi {
    ping: ApiMethodNoArgument<never>;
    fillLogin: ApiMethod<LoginFieldContainer, never>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer, never>;
    login2fa: ApiMethod<{ secret: string }, never>;
}
