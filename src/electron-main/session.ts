import _logger from "electron-log";
import {Session, session} from "electron";
import {from, race} from "rxjs";

import {APP_NAME} from "src/shared/constants";
import {AccountConfig, AccountType} from "src/shared/model/account";
import {Arguments} from "src/shared/types";
import {CI_ENV_LOGOUT_ACTION_TIMEOUT_MS} from "src/e2e/shared-constants"; // tslint:disable-line no-import-zones
import {Config} from "src/shared/model/options";
import {Context} from "./model";
import {INITIAL_STORES} from "./constants";
import {asyncDelay, curryFunctionMembers, getWebViewPartition} from "src/shared/util";
import {initWebRequestListeners} from "src/electron-main/web-request";
import {registerSessionProtocols} from "src/electron-main/protocol";

const logger = curryFunctionMembers(_logger, "[src/electron-main/session]");
const usedPartitions: Set<Arguments<typeof initSessionByLogin>[1]> = new Set();

export async function initSessionByLogin(
    ctx: Context,
    login: AccountConfig<AccountType>["login"],
    options: { skipClearSessionCaches?: boolean } = {},
): Promise<void> {
    const partition = getWebViewPartition(login);

    if (usedPartitions.has(partition)) {
        return;
    }

    await initSession(ctx, session.fromPartition(partition), options);

    usedPartitions.add(partition);
}

export async function initSession(
    ctx: Context,
    instance: Session,
    {skipClearSessionCaches}: { skipClearSessionCaches?: boolean } = {},
): Promise<void> {
    purifyUserAgentHeader(instance);
    await registerSessionProtocols(ctx, instance);
    initWebRequestListeners(ctx, instance);

    if (!skipClearSessionCaches) {
        await clearSessionCaches(ctx, instance);
    }
}

export async function clearSessionsCache(ctx: Context): Promise<void> {
    const config = await ctx.configStore.read();

    await clearSessionCaches(ctx, getDefaultSession(), config);

    for (const partition of usedPartitions) {
        await clearSessionCaches(ctx, session.fromPartition(partition), config);
    }
}

export async function clearSessionCaches(ctx: Context, instance: Session, configArg?: Config | null): Promise<void> {
    logger.info("clearSessionCaches()", "start");

    const config = configArg || await ctx.configStore.read();

    if (
        config && !config.clearSession
        ||
        !INITIAL_STORES.config().clearSession
    ) {
        return;
    }

    const clearStorageDataPromise = new Promise((resolve) => instance.clearStorageData({}, resolve));

    await Promise.all([
        new Promise((resolve) => instance.clearAuthCache({type: "password"}, resolve)),

        new Promise((resolve) => instance.clearCache(resolve)),

        isContinuousIntegrationEnv()
            ? // TODO electron@v4: "clearStorageData()" promise doesn't resolve if running on CI server, so "logout" action gets blocked
            race(
                from(clearStorageDataPromise),
                from(
                    asyncDelay(CI_ENV_LOGOUT_ACTION_TIMEOUT_MS * 0.5).then(() => {
                        logger.warn(`clearSessionCaches(): skipping "clearStorageData" call`);
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

function purifyUserAgentHeader(instance: Session) {
    const appNameRe = new RegExp(`${APP_NAME}[\\/\\S]+`, "i");
    const electronRe = new RegExp("electron", "i");
    const currentUserAgent = String(instance.getUserAgent());
    const purifiedUserAgent = currentUserAgent
        .split(appNameRe)
        .join("")
        .split(/\s+/)
        .filter((chunk) => !electronRe.exec(chunk))
        .join(" ");

    instance.setUserAgent(purifiedUserAgent);
}

function isContinuousIntegrationEnv(): boolean {
    return Boolean(
        process.env.CI
        &&
        (process.env.APPVEYOR || process.env.TRAVIS),
    );
}
