import {AccountType} from "src/shared/model/account";

// user data dir, defaults to app.getPath("userData")
export const RUNTIME_ENV_USER_DATA_DIR = `EMAIL_SECURELY_APP_USER_DATA_DIR`;
// boolean
export const RUNTIME_ENV_E2E = `EMAIL_SECURELY_APP_E2E`;
// protonmail account to login during e2e tests running
export const RUNTIME_ENV_E2E_PROTONMAIL_LOGIN = `EMAIL_SECURELY_APP_E2E_PROTONMAIL_LOGIN`;
export const RUNTIME_ENV_E2E_PROTONMAIL_PASSWORD = `EMAIL_SECURELY_APP_E2E_PROTONMAIL_PASSWORD`;
export const RUNTIME_ENV_E2E_PROTONMAIL_2FA_CODE = `EMAIL_SECURELY_APP_E2E_PROTONMAIL_2FA_CODE`;
export const RUNTIME_ENV_E2E_PROTONMAIL_UNREAD_MIN = `EMAIL_SECURELY_APP_E2E_PROTONMAIL_UNREAD_MIN`;
// tutanota account to login during e2e tests running
export const RUNTIME_ENV_E2E_TUTANOTA_LOGIN = `EMAIL_SECURELY_APP_E2E_TUTANOTA_LOGIN`;
export const RUNTIME_ENV_E2E_TUTANOTA_PASSWORD = `EMAIL_SECURELY_APP_E2E_TUTANOTA_PASSWORD`;
export const RUNTIME_ENV_E2E_TUTANOTA_2FA_CODE = `EMAIL_SECURELY_APP_E2E_TUTANOTA_2FA_CODE`;
export const RUNTIME_ENV_E2E_TUTANOTA_UNREAD_MIN = `EMAIL_SECURELY_APP_E2E_TUTANOTA_UNREAD_MIN`;

export interface EntryUrlItem {
    value: string;
    title: string;
}

export const ACCOUNTS_CONFIG: Record<AccountType, Record<"entryUrl", EntryUrlItem[]>> = {
    protonmail: {
        entryUrl: [
            {value: "https://app.protonmail.ch", title: "https://app.protonmail.ch"},
            {value: "https://mail.protonmail.com", title: "https://mail.protonmail.com"},
            {value: "https://protonirockerxow.onion", title: "https://protonirockerxow.onion (Tor)"},
        ],
    },
    tutanota: {
        entryUrl: [
            {value: "https://mail.tutanota.com", title: "https://mail.tutanota.com"},
        ],
    },
};

export const WEBVIEW_SRC_WHITELIST: string[] = Object
    .entries(ACCOUNTS_CONFIG)
    .reduce((list, [accountType, {entryUrl}]) => list.concat(entryUrl), [] as EntryUrlItem[])
    .map(({value}) => value);

export const ONE_SECOND_MS = 1000;
