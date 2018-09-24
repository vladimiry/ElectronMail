import {session} from "electron";

export async function clearDefaultSessionCaches(): Promise<void> {
    const defaultSession = session.defaultSession;

    if (!defaultSession) {
        throw new Error(`"session.defaultSession" is not defined`);
    }

    await Promise.all([
        new Promise((resolve) => defaultSession.clearAuthCache({type: "password"}, resolve)),
        new Promise((resolve) => defaultSession.clearCache(resolve)),
        new Promise((resolve) => defaultSession.clearStorageData({}, resolve)),
    ]);
}
