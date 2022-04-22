import {pick} from "remeda";

import {PACKAGE_NAME} from "src/shared/const";

type Keytar = Pick<typeof import("keytar"), "getPassword" | "setPassword" | "deletePassword">;

const credentialsKeys = [
    PACKAGE_NAME,
    `master-password${BUILD_ENVIRONMENT === "e2e" ? "-e2e" : ""}`,
] as const;

// TODO don't expose STATE
export const STATE: {
    resolveKeytar: () => Promise<Keytar>;
} = {
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
