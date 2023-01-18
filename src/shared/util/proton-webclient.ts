import {pick} from "remeda";
import {URL} from "@cliqz/url-parser";

import {AccountConfig} from "src/shared/model/account";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {LOCAL_WEBCLIENT_ORIGIN, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/const";
import {ProtonClientSession} from "src/shared/model/proton";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolveProtonAppTypeFromUrlHref} from "src/shared/util/proton-url";

export const getWebViewPartitionName = (
    {login, entryUrl}: DeepReadonly<Pick<AccountConfig, "login" | "entryUrl">>,
): string => `partition/webview/${login}/${entryUrl}`;

const testProtonAppPage = (
    targetProjectType: keyof typeof PROVIDER_REPO_MAP,
    {url, logger}: { url: string; logger: import("src/shared/model/common").Logger },
): {
    shouldInitProviderApi: boolean
    blankHtmlPage: boolean
    packagedWebClientUrl: ReturnType<typeof parsePackagedWebClientUrl>
    projectType?: keyof typeof PROVIDER_REPO_MAP,
} => {
    let projectType: keyof typeof PROVIDER_REPO_MAP | undefined;
    const packagedWebClientUrl = parsePackagedWebClientUrl(url);
    const blankHtmlPage = packagedWebClientUrl?.pathname === `/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}`;
    const protonMailProject = Boolean(
        !blankHtmlPage
        &&
        packagedWebClientUrl
        &&
        (projectType = resolvePackagedWebClientApp(packagedWebClientUrl).project) === targetProjectType
    );
    const result = {
        shouldInitProviderApi: protonMailProject,
        blankHtmlPage,
        packagedWebClientUrl,
        projectType,
    } as const;

    logger.verbose(nameof(testProtonAppPage), JSON.stringify({...result, url, projectType}));

    return result;
};

export const testProtonMailAppPage = (
    params: { url: string; logger: import("src/shared/model/common").Logger },
): ReturnType<typeof testProtonAppPage> & { shouldDisableBrowserNotificationFeature: boolean } => {
    const baseResult = testProtonAppPage("proton-mail", params);

    return {
        ...baseResult,
        shouldDisableBrowserNotificationFeature: baseResult.shouldInitProviderApi,
    };
};

export const testProtonCalendarAppPage = (
    params: { url: string; logger: import("src/shared/model/common").Logger },
): ReturnType<typeof testProtonAppPage> => {
    return testProtonAppPage("proton-calendar", params);
};

export const parsePackagedWebClientUrl = (
    url: string
): null | Readonly<Pick<URL, "protocol" | "hostname" | "pathname" | "href">> => {
    if (!url.startsWith(`${LOCAL_WEBCLIENT_ORIGIN}/`)) {
        return null;
    }
    return pick(new URL(url), ["protocol", "hostname", "pathname", "href"]);
};

export const resolvePackagedWebClientApp = (
    url: Exclude<ReturnType<typeof parsePackagedWebClientUrl>, null>,
): Readonly<{ project: keyof typeof PROVIDER_REPO_MAP }> => {
    return {project: resolveProtonAppTypeFromUrlHref(url.href).type};
};

export const sessionSetupJavaScriptAndNavigate = (
    {savedSessionData, finalCodePart, window = "window"}: {
        window?: string,
        savedSessionData?: {
            clientSession?: ProtonClientSession | null
            sessionStoragePatch?: IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] | null
        },
        finalCodePart?: string,
    }
): string => {
    const generateSessionStoragePatchingCode = (patch: Record<string, unknown>): string => {
        return `(() => {
            const sessionStorageStr = ${JSON.stringify(JSON.stringify(patch))};
            const sessionStorageParsed = JSON.parse(sessionStorageStr);
            for (const [key, value] of Object.entries(sessionStorageParsed)) {
                ${window}.sessionStorage.setItem(key, value);
            }
        })();`;
    };
    const prependCodeParts: string[] = [];

    if (savedSessionData?.clientSession) {
        prependCodeParts.push(...[
            generateSessionStoragePatchingCode(savedSessionData?.clientSession.sessionStorage),
            `(() => {
                const windowNameStr = ${JSON.stringify(JSON.stringify(savedSessionData?.clientSession.windowName))};
                ${window}.name = windowNameStr;
            })();`,
        ]);
    }

    if (savedSessionData?.sessionStoragePatch) {
        prependCodeParts.push(generateSessionStoragePatchingCode(savedSessionData?.sessionStoragePatch));
    }

    if (prependCodeParts.length) {
        return `
            ${prependCodeParts.join("\n\r")};
            ${finalCodePart ?? ""}
        `;
    }

    return `
        ${window}.name = "";
        ${window}.sessionStorage.clear();
        ${finalCodePart ?? ""}
    `;
}
