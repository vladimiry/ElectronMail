import {createHash} from "crypto";
import {pick} from "remeda";

import {PACKAGE_NAME, RUNTIME_ENV_USER_DATA_DIR, RUNTIME_ENV_USER_DATA_DIR_BASED_KEYCHAIN_RECORD} from "src/shared/const";

type Keytar = Pick<typeof import("keytar"), "getPassword" | "setPassword" | "deletePassword">;

const envs = {
    data_dir: process.env[RUNTIME_ENV_USER_DATA_DIR],
    data_dir_based_account_name: process.env[RUNTIME_ENV_USER_DATA_DIR_BASED_KEYCHAIN_RECORD],
} as const;

const accountName = `master-password${envs.data_dir_based_account_name && envs.data_dir ? "-" + shortSha256(envs.data_dir) : ""}`;

const credentialsKeys = [PACKAGE_NAME, `${accountName}${BUILD_ENVIRONMENT === "e2e" ? "-e2e" : ""}`] as const;

// TODO don't expose STATE
export const STATE: {resolveKeytar: () => Promise<Keytar>} = {
    resolveKeytar: async (): ReturnType<(typeof STATE)["resolveKeytar"]> => {
        const keytar = pick(await import("keytar"), ["getPassword", "setPassword", "deletePassword"]);
        STATE.resolveKeytar = async (): ReturnType<(typeof STATE)["resolveKeytar"]> => Promise.resolve(keytar);
        return keytar;
    },
};

export const getPassword = async (): ReturnType<Unpacked<Keytar>["getPassword"]> => {
    return (await STATE.resolveKeytar()).getPassword(...credentialsKeys);
};

export const setPassword = async (password: string): ReturnType<Unpacked<Keytar>["setPassword"]> => {
    return (await STATE.resolveKeytar()).setPassword(...credentialsKeys, password);
};

export const deletePassword = async (): ReturnType<Unpacked<Keytar>["deletePassword"]> => {
    return (await STATE.resolveKeytar()).deletePassword(...credentialsKeys);
};

function shortSha256(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
