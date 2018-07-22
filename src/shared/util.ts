import {AccountConfig} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {MailFolderTypeStringifiedValue, MailFolderTypeTitle, MailFolderTypeValue} from "./model/database";
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

    // TODO consider using some module for building custom errors
    class InvalidArgumentError extends Error {
        constructor(message: string) {
            super(message);
            Object.setPrototypeOf(this, new.target.prototype);
        }
    }

    function parseValueStrict(value: MailFolderTypeValue | MailFolderTypeStringifiedValue): MailFolderTypeValue {
        const result = Number(value) as MailFolderTypeValue;
        if (!values.includes(result)) {
            throw new InvalidArgumentError(`Invalid mail folder type value: ${result}`);
        }
        return result;
    }

    function testValue(value: MailFolderTypeValue | MailFolderTypeStringifiedValue, title: MailFolderTypeTitle): boolean {
        try {
            return mappedByValue[parseValueStrict(value)] === title;
        } catch (e) {
            if (e instanceof InvalidArgumentError) {
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
