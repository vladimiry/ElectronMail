import {ElectronLog} from "electron-log"; // tslint:disable-line:no-import-zones
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";

import {AccountConfig, AccountType} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {DEFAULT_API_CALL_TIMEOUT, DEFAULT_MESSAGES_STORE_PORTION_SIZE, ONE_MINUTE_MS, ONE_SECOND_MS} from "src/shared/constants";
import {DbPatch} from "./api/common";
import {FsDbAccount, View} from "src/shared/model/database";
import {LogLevel} from "src/shared/model/common";
import {LoginFieldContainer} from "./model/container";
import {StatusCodeError} from "./model/error";

export function initialConfig(): Config {
    {
        const encryptionPreset: PasswordBasedPreset = {
            keyDerivation: {type: "sodium.crypto_pwhash", preset: "mode:moderate|algorithm:default"},
            encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"},
        };

        return {
            spellCheckLocale: false,
            encryptionPreset,
            window: {
                bounds: {width: 1024, height: 768},
            },
            fetching: {
                rateLimit: {
                    // 275 requests in 60 seconds
                    intervalMs: ONE_MINUTE_MS,
                    maxInInterval: 275,
                },
                messagesStorePortionSize: DEFAULT_MESSAGES_STORE_PORTION_SIZE,
            },
            timeouts: {
                // "fetchingRateLimiting" values need to be taking into the account defining the "fetching" timeout
                dbBootstrapping: ONE_MINUTE_MS * 60 * 12, // 12 hours
                dbSyncing: ONE_MINUTE_MS * 30, // 30 minutes
                webViewApiPing: ONE_SECOND_MS * 15,
                domElementsResolving: ONE_SECOND_MS * 20,
                defaultApiCall: DEFAULT_API_CALL_TIMEOUT,
                databaseLoading: ONE_MINUTE_MS * 5, // 5 minutes
                indexingBootstrap: ONE_SECOND_MS * 30, // 30 seconds
            },
            updateCheck: {
                releasesUrl: "https://api.github.com/repos/vladimiry/ElectronMail/releases",
                proxy: "",
            },
            indexingBootstrapBufferSize: 1000,
            jsFlags: [
                "--max-old-space-size=3072",
            ],
            localDbMailsListViewMode: "plain",
            // base
            checkUpdateAndNotify: false,
            closeToTray: true,
            compactLayout: true,
            customTrayIconColor: "",
            customUnreadBgColor: "",
            customUnreadTextColor: "",
            disableSpamNotifications: true,
            findInPage: true,
            fullTextSearch: true,
            hideControls: false,
            idleTimeLogOutSec: 0,
            logLevel: "error",
            reflectSelectedAccountTitle: false,
            startMinimized: true,
            unreadNotifications: true,
        };
    }
}

export function pickBaseConfigProperties(
    {
        checkUpdateAndNotify,
        closeToTray,
        compactLayout,
        customTrayIconColor,
        customUnreadBgColor,
        customUnreadTextColor,
        disableSpamNotifications,
        findInPage,
        fullTextSearch,
        hideControls,
        idleTimeLogOutSec,
        logLevel,
        reflectSelectedAccountTitle,
        startMinimized,
        unreadNotifications,
    }: Config,
): Required<BaseConfig> {
    return {
        checkUpdateAndNotify,
        closeToTray,
        compactLayout,
        customTrayIconColor,
        customUnreadBgColor,
        customUnreadTextColor,
        disableSpamNotifications,
        findInPage,
        fullTextSearch,
        hideControls,
        idleTimeLogOutSec,
        logLevel,
        reflectSelectedAccountTitle,
        startMinimized,
        unreadNotifications,
    };
}

export const accountPickingPredicate = (criteria: LoginFieldContainer): (account: AccountConfig) => boolean => {
    return ({login}) => login === criteria.login;
};

export const pickAccountStrict = (accounts: AccountConfig[], criteria: LoginFieldContainer): AccountConfig => {
    const account = accounts.find(accountPickingPredicate(criteria));

    if (!account) {
        throw new StatusCodeError(`Account with "${criteria.login}" login has not been found`, "NotFoundAccount");
    }

    return account;
};

export const asyncDelay = async <T>(pauseTimeMs: number, resolveAction?: () => Promise<T>): Promise<T | void> => {
    return new Promise<T | void>((resolve) => {
        setTimeout(
            () => {
                return typeof resolveAction === "function"
                    ? resolve(resolveAction())
                    : resolve();
            },
            pauseTimeMs,
        );
    });
};

export function curryFunctionMembers<T extends object | ((...a: any[]) => any)>(
    src: T,
    ...args: any[]
): T {
    const dest: T = typeof src === "function"
        ? src.bind(undefined) :
        Object.create(null);

    for (const key of Object.getOwnPropertyNames(src)) {
        const srcMember = (src as any)[key];

        (dest as any)[key] = typeof srcMember === "function"
            ? srcMember.bind(src, ...args)
            : srcMember;
    }

    return dest;
}

export function isEntityUpdatesPatchNotEmpty({conversationEntries, folders, mails, contacts}: DbPatch): boolean {
    return [
        conversationEntries.remove,
        conversationEntries.upsert,
        mails.remove,
        mails.upsert,
        folders.remove,
        folders.upsert,
        contacts.remove,
        contacts.upsert,
    ].some(({length}) => Boolean(length));
}

export function walkConversationNodesTree(
    rootNodes: View.ConversationNode[],
    fn: (arg: { node: View.ConversationNode; mail?: View.ConversationNode["mail"]; }) => void | "break",
): void {
    const state: { nodes: View.ConversationNode[]; } = {nodes: [...rootNodes]};

    while (state.nodes.length) {
        const node = state.nodes.pop();

        if (!node) {
            continue;
        }

        const called = fn({node, mail: node.mail});

        if (typeof called === "string" && called === "break") {
            return;
        }

        state.nodes.unshift(...[...node.children]);
    }
}

export function filterConversationNodesMails(
    rootNodes: View.ConversationNode[],
    filter: (mail: View.Mail) => boolean = () => true,
): View.Mail[] {
    const result: View.Mail[] = [];

    walkConversationNodesTree(rootNodes, ({mail}) => {
        if (mail && filter(mail)) {
            result.push(mail);
        }
    });

    return result;
}

export function mailDateComparatorDefaultsToDesc(o1: View.Mail, o2: View.Mail, order: "desc" | "asc" = "desc") {
    return order === "desc"
        ? o2.sentDate - o1.sentDate
        : o1.sentDate - o2.sentDate;
}

export function mapBy<T, K>(iterable: Iterable<T>, by: (t: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();

    for (const el of iterable) {
        const key = by(el);
        const list = map.get(key) || [];

        list.push(el);
        map.set(key, list);
    }

    return map;
}

// TODO consider using https://github.com/cedx/enum.js instead
export function buildEnumBundle<M, K extends keyof M, V extends Extract<M[keyof M], string | number>>(
    nameValueMap: M,
) {
    const {names, values, valueNameMap} = Object
        .entries(nameValueMap)
        .reduce((
            accumulator: {
                names: K[];
                values: V[];
                valueNameMap: { [k in V]: K };
            },
            entry,
        ) => {
            const [key, value] = entry as unknown as readonly [K, V];
            accumulator.names.push(key);
            accumulator.values.push(value);
            accumulator.valueNameMap[value] = key;
            return accumulator;
        }, {values: [], names: [], valueNameMap: {} as any});

    interface ResolveNameByValue {
        (value: V): K;

        <S extends boolean>(value: V, strict: S): S extends true ? K : K | undefined;
    }

    const resolveNameByValue: ResolveNameByValue = (value: V, strict: boolean = true) => {
        if (strict && !(value in valueNameMap)) {
            throw new Error(`Failed to parse "${value}" value from the "${JSON.stringify(nameValueMap)}" map`);
        }
        return valueNameMap[value];
    };

    interface ParseValue {
        (rawValue: any): V;

        <S extends boolean>(rawValue: any, strict: S): S extends true ? V : V | undefined;
    }

    const parseValue: ParseValue = (rawValue: any, strict: boolean = true) => {
        const name = resolveNameByValue(rawValue, strict);
        if (typeof name === "undefined") {
            return undefined as any;
        }
        return nameValueMap[name];
    };

    // TODO deep freeze the result object
    return {
        ...nameValueMap,
        _: {
            resolveNameByValue,
            parseValue,
            names,
            values,
            nameValueMap,
        } as const,
    } as const;
}

export function isDatabaseBootstrapped(
    metadata: FsDbAccount["metadata"] | null,
): metadata is Readonly<Exclude<typeof metadata, null>> {
    if (!metadata) {
        return false;
    }

    return Boolean(
        Object.keys(metadata.groupEntityEventBatchIds || {}).length,
    );
}

export function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);

    return min + Math.floor(Math.random() * (max - min)); // the maximum is exclusive and the minimum is inclusive
}

export const getWebViewPartition: (login: AccountConfig<AccountType>["login"]) => string = (() => {
    const prefix = "memory/";
    const result: typeof getWebViewPartition = (login) => `${prefix}${login}`;

    return result;
})();

export const validateLoginDelaySecondsRange: (
    loginDelaySecondsRange: string,
) => { validationError: string } | Required<AccountConfig>["loginDelaySecondsRange"] = (() => {
    const re = /^(\d+)-(\d+)$/;
    const result: typeof validateLoginDelaySecondsRange = (loginDelaySecondsRange) => {
        const match = loginDelaySecondsRange.match(re) || [];
        const end = Number(match.pop());
        const start = Number(match.pop());

        if (isNaN(start) || isNaN(end)) {
            return {validationError: `Invalid data format, "number-number" format is expected.`};
        }
        if (start > end) {
            return {validationError: `"Start" value is bigger than "end" value.`};
        }

        return {start, end};
    };

    return result;
})();

export const parseLoginDelaySecondsRange: (
    loginDelaySecondsRange: string,
) => Required<AccountConfig>["loginDelaySecondsRange"] | undefined = (loginDelaySecondsRange) => {
    const validation = validateLoginDelaySecondsRange(loginDelaySecondsRange);

    if ("validationError" in validation) {
        return;
    }

    return validation;
};

export function removeDuplicateItems<T extends any>(array: ReadonlyArray<T>): T[] {
    return [...new Set<T>(array).values()];
}

export function normalizeLocale(value: string): string {
    return value.replace(/[^A-Za-z]/g, "_");
}

export const logLevelEnabled: (
    level: LogLevel,
    logger: { transports: Pick<ElectronLog["transports"], "file"> },
) => boolean = (() => {
    const weights: Readonly<Record<LogLevel | "null" | "undefined" | "false", number>> = {
        null: -1,
        undefined: -1,
        false: -1,
        error: 0,
        warn: 1,
        info: 2,
        verbose: 3,
        debug: 4,
        silly: 5,
    };
    const result: typeof logLevelEnabled = (
        level,
        {transports: {file: {level: transportLevel}}},
    ) => {
        const disabled = (
            weights[level]
            >
            weights[String(transportLevel) as keyof typeof weights]
        );
        return !disabled;
    };
    return result;
})();

// - Breaking changes: https://github.com/mrmlnc/fast-glob/releases/tag/3.0.0
// - How to write patterns on Windows: https://github.com/mrmlnc/fast-glob
export function sanitizeFastGlobPattern(pattern: string): string {
    return pattern.replace(/\\/g, "/");
}

export const resolveOrRejectIfError = (resolve: () => void, reject: (error: Error) => void) => {
    return (error: Error): void => {
        if (error) {
            reject(error);
            return;
        }
        resolve();
    };
};
