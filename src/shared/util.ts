import {BaseConfig, Config} from "_shared/model/options";

export function assert(t: any, m?: string) {
    if (!t) {
        throw new Error(m || "AssertionError");
    }
    return t;
}

// @formatter:off
export function pickBaseConfigProperties(
    {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify}: Config,
): Record<keyof BaseConfig, boolean | undefined> {
    return {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify};
}
// @formatter:on

export const isAllowedUrl = (() => {
    const urlPrefixesWhiteList = [
        "https://mail.protonmail.com",
        "https://protonmail.com",
    ];

    return (url: string) => {
        return !!urlPrefixesWhiteList
            .filter((urlPrefix) => String(url).startsWith(urlPrefix))
            .length;
    };
})();
