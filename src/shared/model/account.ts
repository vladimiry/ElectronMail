import {ProtonClientSession} from "src/shared/model/proton";

export type AccountConfig = NoExtraProps<{
    login: string;
    title?: string;
    entryUrl: string;
    database?: boolean; // TODO proton-v4: rename AccountConfig.database => AccountConfig.localStore
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
}>;

export type AccountPersistentSession = NoExtraProps<{
    readonly cookies: Electron.Cookie[];
    readonly sessionStorage: ProtonClientSession["sessionStorage"];
    readonly window: { name?: ProtonClientSession["windowName"] };
}>;

export type AccountPersistentSessionBundle
    = Record<string /* mapped by "api endpoint origin" */, AccountPersistentSession | undefined>;

export type Notifications = NoExtraProps<{
    loggedIn: boolean;
    pageType: NoExtraProps<{
        url?: string;
        type: "unknown" | "login" | "login2fa" | "unlock";
        skipLoginDelayLogic?: boolean;
    }>;
    unread: number;
}>;
