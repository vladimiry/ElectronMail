import {AccountConfig} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {StatusCode, StatusCodeError} from "./model/error";
import {WEBVIEW_SRC_WHITELIST} from "./constants";

export function pickBaseConfigProperties(
    {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify}: Config,
): Record<keyof BaseConfig, boolean | undefined> {
    return {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify};
}

export const isWebViewSrcWhitelisted = (src: string) => WEBVIEW_SRC_WHITELIST.some((allowedPrefix) => {
    return src.startsWith(allowedPrefix);
});

export const findAccountConfigPredicate = (login: string): (account: AccountConfig) => boolean => {
    return ({login: existingLogin}) => existingLogin === login;
};

export const findExistingAccountConfig = (accounts: AccountConfig[], login: string): AccountConfig => {
    const account = accounts.find(findAccountConfigPredicate(login));

    if (!account) {
        throw new StatusCodeError(
            `Account with "${login}" login has not been found`,
            StatusCode.NotFoundAccount,
        );
    }

    return account;
};
