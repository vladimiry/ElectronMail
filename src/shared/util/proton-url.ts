import {Cookie as CookieParser, SameSite} from "@t-bowersox/cookie";
import type {Cookie as ElectronCookie} from "electron";
import {mapValues} from "remeda";
import {URL} from "@cliqz/url-parser";

import {
    PROTON_API_ENTRY_PROTONMAIL_CH_VALUE, PROTON_API_ENTRY_PROTONMAIL_COM_VALUE, PROTON_API_ENTRY_TOR_V2_VALUE,
    PROTON_API_ENTRY_TOR_V3_VALUE, PROTON_API_ENTRY_URLS, PROTON_API_SUBDOMAINS,
} from "src/shared/const/proton-url";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolvePathnameDirFromUrlHref, resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";

export const protonPrimaryDomainNamesEverUsed = [
    ...PROTON_API_ENTRY_URLS,
    PROTON_API_ENTRY_PROTONMAIL_CH_VALUE,
    PROTON_API_ENTRY_PROTONMAIL_COM_VALUE,
    PROTON_API_ENTRY_TOR_V2_VALUE,
    PROTON_API_ENTRY_TOR_V3_VALUE,
].map((value) => new URL(value).hostname).map(resolvePrimaryDomainNameFromUrlHostname);

export const resolveProtonApiOrigin = (
    {accountEntryUrl, subdomain}: { accountEntryUrl: string, subdomain: string },
): string => {
    const {protocol, hostname} = new URL(accountEntryUrl);
    return `${protocol}//${subdomain}.${resolvePrimaryDomainNameFromUrlHostname(hostname)}`;
};

export const resolveProtonAppTypeFromUrlHref = (href: string): { requestBasePath: string, type: keyof typeof PROVIDER_REPO_MAP } => {
    const requestBasePath = resolvePathnameDirFromUrlHref(href);
    const protonProjectResultType = {requestBasePath, type: "proton-mail"} as const;

    if (requestBasePath === "/" || requestBasePath === "/inbox") {
        return protonProjectResultType;
    }

    // TODO use cached value/constant
    const appsSortedByBasePathLengthDesc = Object
        .values(mapValues(PROVIDER_REPO_MAP, (value, type) => ({...value, type})))
        .sort((a, b) => b.basePath.length - a.basePath.length /* longest values first */);

    for (const {basePath, type} of appsSortedByBasePathLengthDesc) {
        if (`${requestBasePath}/`.startsWith(`/${basePath}/`)) {
            return {requestBasePath, type};
        }
    }

    // TODO consider throwing the error after the v5.0.0+ builds get tested for a while
    console.error( // eslint-disable-line no-console
        `${nameof(resolveProtonAppTypeFromUrlHref)}: failed to resolve the value by ${JSON.stringify({requestBasePath})}"`,
    );

    return protonProjectResultType;
};

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
        // https://github.com/ProtonMail/WebClients/issues/276#issuecomment-1139612047
        const v4ApiBasePath = "/api";
        if (cookie.path && `${cookie.path}/`.startsWith(`${v4ApiBasePath}/`)) {
            cookie.setPath(
                cookie.path.substring(v4ApiBasePath.length) || "/",
            );
        }
    }

    return cookie.getResult() as T;
};

export const depersonalizeProtonApiUrl = (url: string): string => {
    try {
        if (!new URL(url).pathname) {
            return url;
        }
    } catch {
        // the provided url value failed to be parsed to URL so skipping processing
        return url;
    }
    const splitBy = "/";
    const splitParts = url.split(splitBy);
    const lastPart = splitParts.pop();
    return [
        ...splitParts,
        // assuming that long last part is not the endpoint name/sub-name but a value/id
        lastPart && lastPart.length >= 15
            ? "<wiped-out>"
            : lastPart,
    ].join(splitBy);
};

type depersonalizeLoggedUrlsInStringType = (value: unknown) => string;

export const depersonalizeLoggedUrlsInString: depersonalizeLoggedUrlsInStringType = (() => {
    // at the moment only proton urls get depersonalized, ie urls that start from the following urls
    //      https://app.protonmail.ch/
    //      https://mail.protonmail.com/
    //      https://mail.protonmailrmez3lotccipshtkleegetolb73fuirgj7r4o4vfu7ozyd.onion/
    const protonUrlRe = new RegExp(
        PROTON_API_ENTRY_URLS.reduce((accumulator, accountEntryUrl) => {
            return [
                ...accumulator,
                ...PROTON_API_SUBDOMAINS.map((subdomain) => resolveProtonApiOrigin({accountEntryUrl, subdomain})),
            ];
        }, [] as string[]).join("|"),
        "gi",
    );
    const result: depersonalizeLoggedUrlsInStringType = (value) => {
        if (typeof value !== "string") {
            return String(value);
        }
        return value.replace(protonUrlRe, depersonalizeProtonApiUrl);
    };
    return result;
})();
