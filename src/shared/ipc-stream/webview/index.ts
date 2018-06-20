import {Model, Service} from "pubsub-to-stream-api";

import {LoginFieldContainer, MailPasswordFieldContainer, PasswordFieldContainer} from "_shared/model/container";
import {AccountNotificationOutput} from "./notification-output";

export interface Endpoints {
    fillLogin: Model.Action<LoginFieldContainer, { message: string }>;
    login2fa: Model.Action<PasswordFieldContainer, { message: string }>;
    login: Model.Action<LoginFieldContainer & PasswordFieldContainer, { message: string }>;
    notification: Model.Action<undefined, AccountNotificationOutput>;
    unlock: Model.Action<MailPasswordFieldContainer, { message: string }>;
}

// TODO pick prefix from "package.json => name"
export const ipcWebViewChannel = "protonmail-desktop-app:webview-api";

export const ipcWebViewStreamService = new Service<Endpoints>({channel: ipcWebViewChannel});
