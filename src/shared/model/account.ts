import {ProtonClientSession} from "src/shared/model/proton";

export type AccountConfig = NoExtraProps<{
    login: string;
    title?: string;
    entryUrl: string;
    blockNonEntryUrlBasedRequests?: boolean;
    externalContentProxyUrlPattern?: string;
    enableExternalContentProxy?: boolean;
    database?: boolean; // TODO proton-v4: rename AccountConfig.database => AccountConfig.localStore
    localStoreViewByDefault?: boolean;
    // databaseCalendar?: boolean;
    credentials: NoExtraProps<Partial<Record<"password" | "twoFactorCode" | "mailPassword", string>>>;
    proxy?: NoExtraProps<{
        proxyRules?: string;
        proxyBypassRules?: string;
    }>;
    loginDelayUntilSelected?: boolean;
    loginDelaySecondsRange?: NoExtraProps<{ start: number; end: number }>;
    persistentSession?: boolean;
    rotateUserAgent?: boolean;
    disabled?: boolean;
    customCSS?: string;
    customNotification?: boolean;
    customNotificationCode?: string;
    notificationShellExec?: boolean;
    notificationShellExecCode?: string;
}>;

export type AccountPersistentSession = NoExtraProps<{
    readonly cookies: Electron.Cookie[];
    readonly sessionStorage: ProtonClientSession["sessionStorage"];
    readonly window: { name?: ProtonClientSession["windowName"] };
}>;

export type AccountPersistentSessionBundle
    = Record<AccountConfig["entryUrl"] /* mapped by "api endpoint origin" */, AccountPersistentSession | undefined>;

export type AccountSessionStoragePatchBundle
    = Record<AccountConfig["entryUrl"] /* mapped by "api endpoint origin" */, Record<"__cookieStore__", string> | undefined>;

export type Notifications = NoExtraProps<{
    unread: number
    loggedIn: boolean
    loggedInCalendar: boolean
    pageType: NoExtraProps<{
        url?: string
        type: "unknown" | "login" | "login2fa" | "unlock"
        skipLoginDelayLogic?: boolean
    }>
}>;
