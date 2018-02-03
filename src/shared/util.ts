import {Config} from "_shared/model/options";

export function assert(t: any, m?: string) {
    if (!t) {
        throw new Error(m || "AssertionError");
    }
    return t;
}

export function assertUnsignedInteger(t: number, m?: string) {
    return assert(Number.isInteger(t) && t > 0, m || "Not signed integer");
}

function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
    const ret: any = {};

    keys.forEach((key) => {
        ret[key] = obj[key];
    });

    return ret;
}

export function pickBaseConfigProperties(config: Config) {
    return pick(config, "startMinimized", "compactLayout", "closeToTray", "unreadNotifications");
}

// TODO TS: make "in" operator work as type guard
// https://github.com/Microsoft/TypeScript/issues/10485
// https://github.com/Microsoft/TypeScript/pull/15256
export const hasProperty = <K extends string>(o: {}, k: K): o is { [_ in K]: {} } => typeof o === "object" && k in o;

export const isAllowedUrl = (() => {
    const urlPrefixesWhiteList = [
        "https://mail.protonmail.com",
        "https://protonmail.com",
    ];

    return (url: string) => {
        return !!urlPrefixesWhiteList
            .filter((urlPrefix) => String(url).startsWith(urlPrefix))
            .length;
    };
})();
