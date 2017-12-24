import {KeePassRef} from "../keepasshttp";

export interface AccountCredentials {
    password: {
        value?: string;
        keePassRef?: KeePassRef;
    };
    mailPassword: {
        value?: string;
        keePassRef?: KeePassRef;
    };
}

export interface AccountConfig {
    credentials: AccountCredentials;
    login: string;
}

export enum WebAccountPageUrl {
    Undefined = "Undefined",
    Login = "https://mail.protonmail.com/login",
    Unlock = "https://mail.protonmail.com/login/unlock",
    Inbox = "https://mail.protonmail.com/inbox",
}

export interface WebAccountProgress {
    password?: boolean;
    mailPassword?: boolean;
}

export interface WebAccount {
    accountConfig: AccountConfig;
    pageUrl?: WebAccountPageUrl;
    webView?: any; /* TODO switch to Electron.WebviewTag */
    progress: WebAccountProgress;
    sync: {
        title?: string;
        unread?: number;
    };
}
