import {ProtonClientSession} from "src/shared/model/proton";

function pickSessionStorageItems(
    keys: string[] | undefined = (() => { // collection all keys if not specified
        const allKeys = [];

        for (let i = 0, len = sessionStorage.length; i < len; i++) {
            const key = sessionStorage.key(i);

            if (!key) {
                continue;
            }

            allKeys.push(key);
        }

        return allKeys;
    })(),
): Readonly<Record<string, any /* TODO TS: replace "any" with "JSONValue" */>> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = Object.create(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const key of keys) {
        result[key] = sessionStorage.getItem(key);
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

    // proton dumps session to "window.name" and "window.sessionStorage" on "window.unload" event
    // https://github.com/ProtonMail/proton-shared/blob/37716bc2685d9cef8245efcb8d16e827b97a03c5/lib/createSecureSessionStorage.js#L14-L16
    window.dispatchEvent(new Event("unload"));
    // proton dumps session to "window.name" and "window.sessionStorage" on "window.unload" event
    // https://github.com/ProtonMail/proton-shared/blob/c7e008673b518be87127dcfb4e1e2cecac3dbec6/lib/createSecureSessionStorage.js#L23
    window.dispatchEvent(new Event("pagehide"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowName: Readonly<Record<string, any /* TODO TS: replace "any" with "JSONValue" */>> = JSON.parse(window.name);
    const windowNameKeys = Object.keys(windowName);

    if (!windowNameKeys.length) {
        restore();
        return null;
    }

    const sessionStorage = pickSessionStorageItems(windowNameKeys);

    restore();

    return {
        windowName,
        sessionStorage,
    };
}

