import {Session, session} from "electron";
import {concatMap} from "rxjs/operators";
import {from, race, throwError, timer} from "rxjs";

import {AccountConfig} from "src/shared/model/account";
import {Context} from "./model";
import {ONE_SECOND_MS, PACKAGE_NAME} from "src/shared/constants";
import {getWebViewPartition} from "src/shared/util";
import {initWebRequestListeners} from "src/electron-main/web-request";
import {registerSessionProtocols} from "src/electron-main/protocol";

const usedPartitions: Set<Parameters<typeof initSessionByAccount>[1]["login"]> = new Set();

export async function initSessionByAccount(
    ctx: Context,
    account: Pick<AccountConfig, "login" | "proxy">,
): Promise<void> {
    const partition = getWebViewPartition(account.login);

    if (usedPartitions.has(partition)) {
        return;
    }

    await initSession(ctx, session.fromPartition(partition));
    await configureSessionByAccount(account);

    usedPartitions.add(partition);
}

export async function initSession(
    ctx: Context,
    instance: Session,
): Promise<void> {
    purifyUserAgentHeader(instance);
    await registerSessionProtocols(ctx, instance);
    initWebRequestListeners(ctx, instance);
}

export async function configureSessionByAccount(
    account: Pick<AccountConfig, "login" | "proxy">,
): Promise<void> {
    const {proxy} = account;
    const partition = getWebViewPartition(account.login);
    const sessionInstance = session.fromPartition(partition);
    const proxyConfig = {
        ...{
            pacScript: "",
            proxyRules: "",
            proxyBypassRules: "",
        },
        ...(proxy && proxy.proxyRules && proxy.proxyRules.trim() && {
            proxyRules: proxy.proxyRules.trim(),
            proxyBypassRules: (proxy.proxyBypassRules && proxy.proxyRules.trim()) || "",
        }),
    };

    return race(
        from(
            sessionInstance.setProxy(proxyConfig),
        ),
        timer(ONE_SECOND_MS * 2).pipe(
            concatMap(() => throwError(new Error("Failed to configure proxy settings"))),
        ),
    ).toPromise();
}

export function getDefaultSession(): Session {
    const defaultSession = session.defaultSession;

    if (!defaultSession) {
        throw new Error(`"session.defaultSession" is not defined`);
    }

    return defaultSession;
}

function purifyUserAgentHeader(instance: Session) {
    const appNameRe = new RegExp(`${PACKAGE_NAME}[\\/\\S]+`, "i");
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
