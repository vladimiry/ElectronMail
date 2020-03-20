import {ProtonClientSession} from "src/shared/model/proton";

export type AccountConfig = NoExtraProperties<{
    login: string;
    title?: string;
    entryUrl: string;
    database?: boolean; // TODO proton-v4: rename AccountConfig.database => AccountConfig.localStore
    // databaseCalendar?: boolean;
    credentials: NoExtraProperties<Partial<Record<"password" | "twoFactorCode" | "mailPassword", string>>>;
    proxy?: NoExtraProperties<{
        proxyRules?: string;
        proxyBypassRules?: string;
    }>;
    loginDelayUntilSelected?: boolean;
    loginDelaySecondsRange?: NoExtraProperties<{ start: number; end: number }>;
    persistentSession?: boolean;
}>;

export type AccountPersistentSession = NoExtraProperties<{
    readonly cookies: Electron.Cookie[];
    readonly sessionStorage: ProtonClientSession["sessionStorage"];
    readonly window: { name?: ProtonClientSession["windowName"] };
}>;

export type AccountPersistentSessionBundle
    = Record<string /* mapped by "api endpoint origin" */, AccountPersistentSession | undefined>;

export type Notifications = NoExtraProperties<{
    loggedIn: boolean;
    pageType: NoExtraProperties<{
        url?: string;
        type: "unknown" | "login" | "login2fa" | "unlock";
        skipLoginDelayLogic?: boolean;
    }>;
    unread: number;
}>;
