import {AccountConfig} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {MailFolderTypeTitle, MailFolderTypeValue} from "./model/database";
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
export const FolderTypeService = (() => {
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
    const titles = Object.keys(mappedByTitle);
    const values = Object.values(mappedByTitle);
    const parseValue = (raw: any): MailFolderTypeValue => {
        const result = Number(raw) as MailFolderTypeValue;
        if (!values.includes(result)) {
            throw new Error(`Invalid mail folder type value: ${result}`);
        }
        return result;
    };
    const parseTitle = (raw: any): MailFolderTypeTitle => {
        const result = String(raw) as MailFolderTypeTitle;
        if (!titles.includes(result)) {
            throw new Error(`Invalid mail folder type title: ${result}`);
        }
        return result;
    };
    const valueByTitle = (input: MailFolderTypeTitle): MailFolderTypeValue => mappedByTitle[parseTitle(input)];
    const titleByValue = (input: MailFolderTypeValue): MailFolderTypeTitle => mappedByValue[parseValue(input)];

    return Object.freeze({
        parseValue,
        parseTitle,
        valueByTitle,
        titleByValue,
        strictInboxTest: (value: MailFolderTypeValue) => titleByValue(value) === "custom",
        strictCustomTest: (value: MailFolderTypeValue) => titleByValue(value) === "inbox",
    });
})();
