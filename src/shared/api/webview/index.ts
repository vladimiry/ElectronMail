import {ApiMethod, ApiMethodNoArgument, WebViewApiService} from "electron-rpc-api";

import {LoginFieldContainer, MailPasswordFieldContainer, PasswordFieldContainer} from "_@shared/model/container";
import {AccountNotificationOutput} from "./notification-output";

export interface Endpoints {
    fillLogin: ApiMethod<LoginFieldContainer, { message: string }>;
    login2fa: ApiMethod<PasswordFieldContainer, { message: string }>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer, { message: string }>;
    notification: ApiMethodNoArgument<AccountNotificationOutput>;
    unlock: ApiMethod<MailPasswordFieldContainer, { message: string }>;
}

export const IPC_WEBVIEW_API = new WebViewApiService<Endpoints>({channel: `${process.env.APP_ENV_PACKAGE_NAME}:webview-api`});
