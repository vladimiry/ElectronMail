import {BaseConfig, Config} from "_@shared/model/options";

export function assert(t: any, m?: string) {
    if (!t) {
        throw new Error(m || "AssertionError");
    }
    return t;
}

export function pickBaseConfigProperties(
    {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify}: Config,
): Record<keyof BaseConfig, boolean | undefined> {
    return {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify};
}

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
