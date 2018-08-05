import {ApiMethod} from "electron-rpc-api";

import {AccountConfig, AccountType} from "src/shared/model/account";
import {APP_NAME} from "src/shared/constants";
import {LoginFieldContainer, PasswordFieldContainer} from "src/shared/model/container";
import {Mail} from "src/shared/model/database";
import {Omit} from "src/shared/types";
import {ZoneApiParameter} from "src/shared/api/common";

export const channel = `${APP_NAME}:webview-api`;

export interface CommonApi {
    ping: ApiMethod<ZoneApiParameter, never>;
    fillLogin: ApiMethod<LoginFieldContainer & ZoneApiParameter, never>;
    login: ApiMethod<LoginFieldContainer & PasswordFieldContainer & ZoneApiParameter, never>;
    login2fa: ApiMethod<{ secret: string } & ZoneApiParameter, never>;
}

export interface FetchMessagesInput {
    type: AccountType;
    login: AccountConfig["login"];
    rawNewestTimestamp?: string;
}

export interface FetchMessagesOutput {
    mail: Omit<Mail, "pk">;
}
