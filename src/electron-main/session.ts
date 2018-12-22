import _logger from "electron-log";
import {Session, session} from "electron";
import {from, race} from "rxjs";

import {APP_NAME} from "src/shared/constants";
// tslint:disable-next-line no-import-zones
import {CI_ENV_LOGOUT_ACTION_TIMEOUT_MS} from "src/e2e/shared-constants";
import {asyncDelay, curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/session]");

export async function initDefaultSession(): Promise<void> {
    await clearDefaultSessionCaches();
    purifyUserAgentHeader();
}

export async function clearDefaultSessionCaches(): Promise<void> {
    logger.info("clearDefaultSessionCaches()", "start");

    const defaultSession = getDefaultSession();
    const clearStorageDataPromise = new Promise((resolve) => defaultSession.clearStorageData({}, resolve));

    await Promise.all([
        new Promise((resolve) => defaultSession.clearAuthCache({type: "password"}, resolve)),

        new Promise((resolve) => defaultSession.clearCache(resolve)),

        isContiniousIntegrationEnv()
            ? // TODO electron@v4: "clearStorageData()" promise doesn't resolve if running on CI server, so "logout" action gets blocked
            race(
                from(clearStorageDataPromise),
                from(
                    asyncDelay(CI_ENV_LOGOUT_ACTION_TIMEOUT_MS * 0.5).then(() => {
                        logger.warn(clearDefaultSessionCaches(), `skipping "clearStorageData" call`);
                        return {};
                    }),
                ),
            ).toPromise()
            : clearStorageDataPromise,
    ]);

    logger.info("clearDefaultSessionCaches()", "end");
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

function isContiniousIntegrationEnv(): boolean {
    return Boolean(process.env.CI && (process.env.APPVEYOR || process.env.TRAVIS));
}
