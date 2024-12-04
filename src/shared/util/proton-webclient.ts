import {pick} from "remeda";
import {URL} from "@ghostery/url-parser";

import {AccountConfig} from "src/shared/model/account";
import {LOCAL_WEBCLIENT_ORIGIN, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/const";
import {PROTON_APP_MAIL_LOGIN_PATHNAME} from "src/shared/const/proton-url";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolveProtonAppTypeFromUrlHref} from "src/shared/util/proton-url";

export const getWebViewPartitionName = ({login, entryUrl}: DeepReadonly<Pick<AccountConfig, "login" | "entryUrl">>): string =>
    `partition/webview/${login}/${entryUrl}`;

type testProtonAppPageResult<T extends keyof typeof PROVIDER_REPO_MAP, P extends boolean = boolean> = P extends true ? {
        targetedProtonProject: P;
        blankHtmlPage: false;
        packagedWebClientUrl: ReturnType<typeof parsePackagedWebClientUrl>;
        projectType: T;
    }
    : {
        targetedProtonProject: false;
        blankHtmlPage: boolean;
        packagedWebClientUrl: ReturnType<typeof parsePackagedWebClientUrl>;
        projectType?: keyof typeof PROVIDER_REPO_MAP;
    };

export const testProtonAppPage = <T extends keyof typeof PROVIDER_REPO_MAP>(
    targetProjectType: T,
    {url, logger}: {url: string; logger: import("src/shared/model/common").Logger},
): testProtonAppPageResult<T> => {
    let projectType: keyof typeof PROVIDER_REPO_MAP | undefined;
    const packagedWebClientUrl = parsePackagedWebClientUrl(url);
    const blankHtmlPage = packagedWebClientUrl?.pathname === `/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}`;
    const targetedProtonProject = Boolean(
        !blankHtmlPage
            && packagedWebClientUrl?.pathname !== PROTON_APP_MAIL_LOGIN_PATHNAME
            && packagedWebClientUrl
            && (projectType = resolvePackagedWebClientApp(packagedWebClientUrl).project) === targetProjectType,
    );
    const result = {
        targetedProtonProject,
        blankHtmlPage,
        packagedWebClientUrl,
        projectType,
    };

    logger.verbose(nameof(testProtonAppPage), JSON.stringify({...result, url, projectType}));

    if (targetedProtonProject && !blankHtmlPage && projectType === targetProjectType) {
        return result as testProtonAppPageResult<T, true>;
    }

    return result as testProtonAppPageResult<T, false>;
};

export const parsePackagedWebClientUrl = (url: string): null | Readonly<Pick<URL, "protocol" | "hostname" | "pathname" | "href">> => {
    if (!url.startsWith(`${LOCAL_WEBCLIENT_ORIGIN}/`)) {
        return null;
    }
    return pick(new URL(url), ["protocol", "hostname", "pathname", "href"]);
};

export const resolvePackagedWebClientApp = (
    url: Exclude<ReturnType<typeof parsePackagedWebClientUrl>, null>,
): Readonly<{project: keyof typeof PROVIDER_REPO_MAP}> => {
    return {project: resolveProtonAppTypeFromUrlHref(url.href).type};
};
