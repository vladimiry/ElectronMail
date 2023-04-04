import {Cookie as CookieParser, SameSite} from "@t-bowersox/cookie";
import type {Cookie as ElectronCookie} from "electron";
import {URL} from "@cliqz/url-parser";

import {getHeader} from "src/electron-main/web-request/service";
import {HEADERS} from "src/electron-main/web-request/const";
import {
    PROTON_API_ENTRY_PROTONMAIL_CH_VALUE, PROTON_API_ENTRY_PROTONMAIL_COM_VALUE, PROTON_API_ENTRY_TOR_V2_VALUE,
    PROTON_API_ENTRY_TOR_V3_VALUE, PROTON_API_ENTRY_URLS,
} from "src/shared/const/proton-url";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";

const protonPrimaryDomainNamesEverUsed = [
    ...PROTON_API_ENTRY_URLS,
    PROTON_API_ENTRY_PROTONMAIL_CH_VALUE,
    PROTON_API_ENTRY_PROTONMAIL_COM_VALUE,
    PROTON_API_ENTRY_TOR_V2_VALUE,
    PROTON_API_ENTRY_TOR_V3_VALUE,
].map((value) => new URL(value).hostname).map(resolvePrimaryDomainNameFromUrlHostname);

export const protonApiUrlsUtil = {
    // https://github.com/ProtonMail/WebClients/issues/276#issuecomment-1139612047
    resolveCookiePath(cookiePath: string): string | null {
        const v4ApiBasePath = "/api";
        if (`${cookiePath}/`.startsWith(`${v4ApiBasePath}/`)) {
            return cookiePath.substring(v4ApiBasePath.length) || "/";
        }
        return null;
    },

    // https://github.com/vladimiry/ElectronMail/issues/490#issuecomment-1046883249
    patchCaptchaResponseHeaders(urlPathname: string, responseHeaders: Record<string, string[]>): boolean {
        if (!`${urlPathname}/`.includes("/captcha/")) {
            return false;
        }

        for (const headerName of Object.keys(responseHeaders)) {
            const headerValues = responseHeaders[headerName];
            if (headerName.toLowerCase() !== "content-security-policy" || !headerValues) {
                continue;
            }
            responseHeaders[headerName] = headerValues.map((headerValue) => {
                return headerValue.replace(/(frame-ancestors|report-uri|report-to)[\s]+([^;]*)[;]?/gi, "");
            });
        }

        return true;
    },

    // https://github.com/vladimiry/ElectronMail/issues/522#issuecomment-1156989727
    patchAuthHeaders(urlPathname: string, requestHeaders: Record<string, string>): boolean {
        if (
            !`${urlPathname}/`.startsWith("/auth/")
            &&
            !`${urlPathname}/`.startsWith("/api/auth/")
            &&
            !`${urlPathname}/`.startsWith("/core/auth/")) {
            return false;
        }

        /* eslint-disable max-len */
        // https://github.com/ProtonMail/WebClients/blob/b80250c0e785b594d2a0c83711c0f787f5f9b2ef/packages/shared/lib/constants.ts#L54
        // https://github.com/ProtonMail/WebClients/blob/b80250c0e785b594d2a0c83711c0f787f5f9b2ef/packages/shared/lib/fetch/headers.ts#L23
        /* eslint-enable max-len */
        const clientID = "web-account";
        const appVersion = String(PROVIDER_REPO_MAP["proton-account"].tag.split("@").pop());

        const headerName = getHeader(requestHeaders, HEADERS.request.xPmAppVersion)?.name ?? HEADERS.request.xPmAppVersion;
        requestHeaders[headerName] = `${clientID}@${appVersion}`;

        return true;
    },

    patchMailApiHeaders(urlPathname: string, requestHeaders: Record<string, string>): boolean {
        if (!urlPathname.includes("/mail/v4/messages/")) {
            return false;
        }
        // eslint-disable-next-line max-len
        // https://github.com/ProtonMail/WebClients/blob/0bbd15b60334ee3322f9a71789f0773e33ede80b/packages/encrypted-search/lib/esHelpers/esAPI.ts#L52
        requestHeaders.Priority = "u=7";
        return true;
    },
} as const;

export const processProtonCookieRecord = <T extends string | ElectronCookie>(
    inputCookie: DeepReadonly<T>, {requestUrlPrimaryDomainName}: { requestUrlPrimaryDomainName: string },
): T => {
    const cookie = (() => {
        // starting from @electron v12 (more exactly from the respective @chromium version)
        // the "set-cookie" records with "samesite=strict" get blocked by @chromium for the "/api/auth/cookies" request at least
        // so to workaround the issue we replace the "samesite=strict|lax"-like attribute with "samesite=none"
        // TODO consider patching the "samesite" cookie attribute only for "/api/auth/cookies" request
        const baseService = typeof inputCookie === "string"
            ? (() => {
                const _cookie_ = CookieParser.parse(inputCookie);
                _cookie_.setSecure(true);
                _cookie_.setSameSite(SameSite.None);
                return {
                    get _cookie_() { return _cookie_; },
                    setDomain: (value: string): unknown => _cookie_.setDomain(value),
                    setPath: (value: string): unknown => _cookie_.setPath(value),
                    getResult: () => _cookie_.toString(),
                };
            })()
            : (() => {
                const cookie = inputCookie as ElectronCookie;
                cookie.secure = true;
                cookie.sameSite = "no_restriction";
                return {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                    get _cookie_() { return cookie as ElectronCookie; },
                    setDomain: (value: string): unknown => cookie.domain = value,
                    setPath: (value: string): unknown => cookie.path = value,
                    getResult: () => cookie,
                };
            })();
        return {
            get domain() { return baseService._cookie_.domain; },
            get path() { return baseService._cookie_.path; },
            ...baseService,
        } as const;
    })();

    if (cookie.domain) {
        if (
            // only overwriting domain if it's a "known" one (alien/external domain here should be generally impossible)
            protonPrimaryDomainNamesEverUsed.includes(
                resolvePrimaryDomainNameFromUrlHostname(
                    cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain,
                ),
            )
        ) {
            cookie.setDomain(`.${requestUrlPrimaryDomainName}`);
        }
    } else {
        cookie.setDomain(`.${requestUrlPrimaryDomainName}`);
    }

    {
        const cookiePath = cookie.path && protonApiUrlsUtil.resolveCookiePath(cookie.path);
        if (cookiePath) {
            cookie.setPath(cookiePath);
        }
    }

    return cookie.getResult() as T;
};
