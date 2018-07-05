import {ApiMethod, WebViewApiService} from "electron-rpc-api";

import {AccountNotifications} from "_@shared/model/account";
import {LoginFieldContainer, MailPasswordFieldContainer, PasswordFieldContainer} from "_@shared/model/container";

const channel = `${process.env.APP_ENV_PACKAGE_NAME}:webview-api`;

export interface ProtonmailApi {
    fillLogin: ApiMethod<LoginFieldContainer, never>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer, never>;
    login2fa: ApiMethod<{ secret: string }, never>;
    notification: ApiMethod<{ entryUrl: string }, AccountNotifications>;
    unlock: ApiMethod<MailPasswordFieldContainer, never>;
}

export interface TutanotaApi {
    fillLogin: ApiMethod<LoginFieldContainer, never>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer, never>;
    login2fa: ApiMethod<{ secret: string }, never>;
    notification: ApiMethod<{ entryUrl: string }, AccountNotifications>;
}

export const IPC_WEBVIEW_API: { protonmail: WebViewApiService<ProtonmailApi>, tutanota: WebViewApiService<TutanotaApi> } = {
    protonmail: new WebViewApiService<ProtonmailApi>({channel}),
    tutanota: new WebViewApiService<TutanotaApi>({channel}),
};
