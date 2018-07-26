import {AccountConfig} from "./model/account";
import {BaseConfig, Config} from "./model/options";

import {LoginFieldContainer} from "./model/container";
import {MailFolderTypeStringifiedValue, MailFolderTypeTitle, MailFolderTypeValue} from "./model/database";
import {StatusCode, StatusCodeError} from "./model/error";
import {WEBVIEW_SRC_WHITELIST} from "./constants";

export function pickBaseConfigProperties(
    {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify, logLevel}: Config,
): BaseConfig {
    return {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify, logLevel};
}

export const isWebViewSrcWhitelisted = (src: string) => WEBVIEW_SRC_WHITELIST.some((allowedPrefix) => {
    return src.startsWith(allowedPrefix);
});

export const accountPickingPredicate = (criteria: LoginFieldContainer): (account: AccountConfig) => boolean => {
    return ({login}) => login === criteria.login;
};

export const pickAccountStrict = (accounts: AccountConfig[], criteria: LoginFieldContainer): AccountConfig => {
    const account = accounts.find(accountPickingPredicate(criteria));

    if (!account) {
        throw new StatusCodeError(
            `Account with "${criteria.login}" login has not been found`,
            StatusCode.NotFoundAccount,
        );
    }

    return account;
};

export const asyncDelay = async <T>(pauseTimeMs: number, resolveAction?: () => Promise<T>): Promise<T | void> => {
    return await new Promise<T | void>((resolve) => {
        setTimeout(() => typeof resolveAction === "function" ? resolve(resolveAction()) : resolve(), pauseTimeMs);
    });
};

export const curryFunctionMembers = <T extends any>(src: T, ...args: any[]): T => {
    const dest: T = typeof src === "function" ? src.bind(undefined) : {};
    for (const key of Object.getOwnPropertyNames(src)) {
        const srcMember = src[key];
        if (typeof srcMember === "function") {
            dest[key] = srcMember.bind(undefined, ...args);
        }
    }
    return dest;
};

// tslint:disable-next-line:variable-name
export const MailFolderTypeService = (() => {
    const mappedByTitle: Readonly<Record<MailFolderTypeTitle, MailFolderTypeValue>> = {
        custom: 0,
        inbox: 1,
        sent: 2,
        trash: 3,
        archive: 4,
        spam: 5,
        draft: 6,
    };
    const mappedByValue: Readonly<Record<MailFolderTypeValue, MailFolderTypeTitle>> = Object
        .entries(mappedByTitle)
        .reduce((accumulator, [key, value]) => ({
            ...accumulator,
            [value]: key as MailFolderTypeTitle,
        }), {} as Record<MailFolderTypeValue, MailFolderTypeTitle>);
    const values = Object.values(mappedByTitle);

    function parseValueStrict(value: MailFolderTypeValue | MailFolderTypeStringifiedValue): MailFolderTypeValue {
        const result = Number(value) as MailFolderTypeValue;
        if (!values.includes(result)) {
            throw new StatusCodeError(`Invalid mail folder type value: ${result}`, StatusCode.InvalidArgument);
        }
        return result;
    }

    function testValue(value: MailFolderTypeValue | MailFolderTypeStringifiedValue, title: MailFolderTypeTitle): boolean {
        try {
            return mappedByValue[parseValueStrict(value)] === title;
        } catch (e) {
            if (e instanceof StatusCodeError && e.statusCode === StatusCode.InvalidArgument) {
                return false;
            }
            throw e;
        }
    }

    return Object.freeze({
        parseValueStrict,
        testValue,
    });
})();
