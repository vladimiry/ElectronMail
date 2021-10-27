import path from "path";
import {randomString} from "remeda";

import {ONE_SECOND_MS} from "src/shared/constants";

export const IS_CI = Boolean(process.env.CI);

export const ROOT_DIR_PATH = path.resolve(process.cwd());

export const APP_DIR_PATH = path.join(ROOT_DIR_PATH, "./app");

export const MAIN_SCRIPT_FILE = path.join(APP_DIR_PATH, "./electron-main/index-e2e.cjs");

export const ENV = {
    masterPassword: `master-password-${randomString(8)}`,
    loginPrefix: `login-${randomString(8)}`,
} as const;

export const CONF = {
    timeouts: {
        element: ONE_SECOND_MS,
        elementTouched: ONE_SECOND_MS * (IS_CI ? 1.5 : 0.3),
        encryption: ONE_SECOND_MS * (IS_CI ? 10 : 1.5),
        transition: ONE_SECOND_MS * (IS_CI ? 3 : 0.3),
        logout: ONE_SECOND_MS * (IS_CI ? 20 : 8),
        loginFilledOnce: ONE_SECOND_MS * (IS_CI ? 60 : 15),
    },
} as const;

export const GLOBAL_STATE = {
    loginPrefixCount: 0,
};
