import {ProtonClientSession} from "src/shared/model/proton";

function pickSessionStorageItems(
    keys: string[] | undefined = (() => { // collection all keys if not specified
        const allKeys = [];

        for (let i = 0, len = window.sessionStorage.length; i < len; i++) {
            const key = window.sessionStorage.key(i);

            if (!key) {
                continue;
            }

            allKeys.push(key);
        }

        return allKeys;
    })(),
): Readonly<Record<string, any /* TODO TS: replace "any" with "JSONValue" */>> { // eslint-disable-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const result: Record<string, any> = Object.create(null);

    for (const key of keys) {
        result[key] = window.sessionStorage.getItem(key);
    }

    return result;
}

export function dumpProtonSharedSession(): ProtonClientSession | null {
    const restore = (() => {
        const backup = {
            windowName: window.name,
            sessionStorage: pickSessionStorageItems(),
        } as const;
        return () => {
            window.name = backup.windowName;
            window.sessionStorage.clear();
            for (const [key, value] of Object.entries<string>(backup.sessionStorage)) {
                window.sessionStorage.setItem(key, value);
            }
        };
    })();

    // dumping the proton session
    // https://github.com/ProtonMail/WebClients/commit/c448533e4d72d6909812ec12aaaff832b790de2b
    // https://github.com/ProtonMail/proton-shared/blob/37716bc2685d9cef8245efcb8d16e827b97a03c5/lib/createSecureSessionStorage.js#L14-L16
    // https://github.com/ProtonMail/proton-shared/blob/c7e008673b518be87127dcfb4e1e2cecac3dbec6/lib/createSecureSessionStorage.js#L23
    window.dispatchEvent(new Event("electron-mail:packages/shared/lib/authentication/createSecureSessionStorage.ts:unloadLike"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const windowName: Readonly<Record<string, any /* TODO TS: replace "any" with "JSONValue" */>> = JSON.parse(window.name);
    const sessionStorage = pickSessionStorageItems(["proton:storage"]);

    restore();

    return {
        windowName,
        sessionStorage,
    };
}
