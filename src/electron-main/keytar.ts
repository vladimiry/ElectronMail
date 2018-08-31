// tslint:disable-next-line:no-import-zones
import keytar from "keytar";

import {APP_NAME} from "src/shared/constants";

const SERVICE = APP_NAME;
const ACCOUNT = "master-password";

export const getPassword: () => ReturnType<typeof keytar.getPassword> = () => {
    return keytar.getPassword(SERVICE, ACCOUNT);
};

export const setPassword: (password: string) => ReturnType<typeof keytar.setPassword> = (password) => {
    return keytar.setPassword(SERVICE, ACCOUNT, password);
};

export const deletePassword: () => ReturnType<typeof keytar.deletePassword> = () => {
    return keytar.deletePassword(SERVICE, ACCOUNT);
};
