import {pick} from "remeda";

import {PACKAGE_NAME} from "src/shared/constants";

const service = PACKAGE_NAME;
const account = "master-password";

type Keytar = Pick<typeof import("keytar"), "getPassword" | "setPassword" | "deletePassword">;  // tslint:disable-line:no-import-zones

// TODO don't expose STATE
export const STATE: {
    resolveKeytar: () => Promise<Keytar>;
} = {
    resolveKeytar: async (): ReturnType<(typeof STATE)["resolveKeytar"]> => {
        const keytar = pick(
            await import("keytar"), // tslint:disable-line:no-import-zones
            ["getPassword", "setPassword", "deletePassword"],
        );

        STATE.resolveKeytar = async (): ReturnType<(typeof STATE)["resolveKeytar"]> => Promise.resolve(keytar);

        return keytar;
    },
};

export const getPassword: () => ReturnType<Unpacked<Keytar>["getPassword"]> = async () => {
    const keytar = await STATE.resolveKeytar();
    return keytar.getPassword(service, account);
};

export const setPassword: (password: string) => ReturnType<Unpacked<Keytar>["setPassword"]> = async (password) => {
    const keytar = await STATE.resolveKeytar();
    return keytar.setPassword(service, account, password);
};

export const deletePassword: () => ReturnType<Unpacked<Keytar>["deletePassword"]> = async () => {
    const keytar = await STATE.resolveKeytar();
    return keytar.deletePassword(service, account);
};
