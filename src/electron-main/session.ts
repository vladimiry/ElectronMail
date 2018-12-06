import {Session, session} from "electron";

import {APP_NAME} from "src/shared/constants";

const storagesToClear = [
    "appcache",
    "cookies",
    "filesystem",
    // "indexdb", // Tutanota stores search index ans some settings in IndexedDB
    "localstorage",
    "shadercache",
    "websql",
    "serviceworkers",
    "cachestorage",
];

export async function initDefaultSession(): Promise<void> {
    await clearDefaultSessionCaches();
    purifyUserAgentHeader();
}

export async function clearDefaultSessionCaches(): Promise<void> {
    const defaultSession = getDefaultSession();

    await Promise.all([
        new Promise((resolve) => defaultSession.clearAuthCache({type: "password"}, resolve)),
        new Promise((resolve) => defaultSession.clearCache(resolve)),
        new Promise((resolve) => defaultSession.clearStorageData({storages: storagesToClear}, resolve)),
    ]);
}

export function getDefaultSession(): Session {
    const defaultSession = session.defaultSession;

    if (!defaultSession) {
        throw new Error(`"session.defaultSession" is not defined`);
    }

    return defaultSession;
}

function purifyUserAgentHeader() {
    const appNameRe = new RegExp(`${APP_NAME}[\\/\\S]+`, "i");
    const electronRe = new RegExp("electron", "i");
    const currentUserAgent = String(getDefaultSession().getUserAgent());
    const purifiedUserAgent = currentUserAgent
        .split(appNameRe)
        .join("")
        .split(/\s+/)
        .filter((chunk) => !electronRe.exec(chunk))
        .join(" ");

    getDefaultSession().setUserAgent(purifiedUserAgent);
}
