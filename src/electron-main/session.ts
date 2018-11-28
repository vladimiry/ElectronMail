import {Session, session} from "electron";

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
