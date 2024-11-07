import {pick} from "remeda";
import {URL} from "@ghostery/url-parser";

import {ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN} from "src/shared/const";
import {AccountConfig} from "src/shared/model/account";

export const resolvePrimaryDomainNameFromUrlHostname = (hostname: string): string => hostname.split(".").slice(-2).join(".");

export const resolvePathnameDirFromUrlHref = (href: string): string => {
    // return path.parse(new URL(href).pathname).dir;
    const parts = `/${new URL(href).pathname}`.split("/");
    const lastPartIsFileLike = parts[parts.length - 1]?.includes(".");
    return "/" + (lastPartIsFileLike ? parts.slice(0, parts.length - 1) : parts).filter(Boolean).join("/");
};

export const verifyUrlOriginValue = (origin: string): string | never => {
    if (
        !origin
        // browsers resolve "new URL(...).origin" of custom schemes as "null" string value
        // example: new URL("webclient://domain.net/blank.html?loader-id=2fb1c580").origin
        || String(origin).trim() === "null"
    ) {
        throw new Error(`Unexpected "origin" value detected (value: "${JSON.stringify({origin: String(origin)})}")`);
    }
    return origin;
};

export const parseUrlOriginWithNullishCheck = (url: string): string | never => {
    const {origin} = new URL(url);
    verifyUrlOriginValue(origin);
    return origin;
};

export const validateExternalContentProxyUrlPattern = (
    {externalContentProxyUrlPattern: value, enableExternalContentProxy: enabled}: Pick<
        NoExtraProps<DeepReadonly<AccountConfig>>,
        "externalContentProxyUrlPattern" | "enableExternalContentProxy"
    >,
): boolean => {
    if (!enabled && !value) { // empty value allowed if feature not enabled
        return true;
    }
    if (!value) {
        return false;
    }
    const parsedUrl = (() => {
        try {
            const url = new URL(value);
            return {origin: parseUrlOriginWithNullishCheck(value), ...pick(url, ["pathname", "search"])};
        } catch {
            return null;
        }
    })();
    return Boolean(
        parsedUrl
            && (parsedUrl.origin
                && !parsedUrl.origin.includes(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN))
            && [parsedUrl.pathname, parsedUrl.search].filter((valuePart) =>
                    valuePart.includes(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN)
                ).length === 1,
    );
};

export const buildUrlOriginsFailedMsgTester = (
    // array item can be either url or already parsed origin (mixed array item types allowed)
    // since each array item value get parsed/verified by the function
    allowedOriginsOrUrls: readonly string[],
): (url: string) => null | string => {
    const originsWhitelist = allowedOriginsOrUrls.map(parseUrlOriginWithNullishCheck);
    const originsWhitelistStr = JSON.stringify(
        [...originsWhitelist].map((value) => value.split("").reverse().join("")).sort().map((value) => value.split("").reverse().join("")),
        null,
        2,
    );
    return (url: string) => {
        const urlOrigin = parseUrlOriginWithNullishCheck(url);
        return originsWhitelist.includes(urlOrigin)
            ? null
            : `No matched value found in ${originsWhitelistStr} URL origins list for "${urlOrigin}" value.`;
    };
};
