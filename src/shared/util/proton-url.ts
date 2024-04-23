import {mapValues} from "remeda";
import {URL} from "@cliqz/url-parser";

import {PROTON_API_ENTRY_URLS, PROTON_API_SUBDOMAINS, PROTON_APP_MAIL_LOGIN_PATHNAME} from "src/shared/const/proton-url";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolvePathnameDirFromUrlHref, resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";

export const resolveProtonApiOrigin = ({accountEntryUrl, subdomain}: {accountEntryUrl: string; subdomain: string}): string => {
    const {protocol, hostname} = new URL(accountEntryUrl);
    return `${protocol}//${subdomain}.${resolvePrimaryDomainNameFromUrlHostname(hostname)}`;
};

export const resolveProtonAppTypeFromUrlHref = (href: string): {requestBasePath: string; type: keyof typeof PROVIDER_REPO_MAP} => {
    const requestBasePath = resolvePathnameDirFromUrlHref(href);
    const protonProjectResultType = {requestBasePath, type: "proton-mail"} as const;

    if (requestBasePath === "/" || requestBasePath === "/inbox" || requestBasePath === PROTON_APP_MAIL_LOGIN_PATHNAME) {
        return protonProjectResultType;
    }

    // TODO use cached value/constant
    const appsSortedByBasePathLengthDesc = Object.values(mapValues(PROVIDER_REPO_MAP, (value, type) => ({...value, type}))).sort((a, b) =>
        b.basePath.length - a.basePath.length /* longest values first */
    );

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
            return [...accumulator, ...PROTON_API_SUBDOMAINS.map((subdomain) => resolveProtonApiOrigin({accountEntryUrl, subdomain}))];
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
