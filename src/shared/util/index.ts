import {keys} from "ts-transformer-keys";
import {mapValues, pick} from "remeda";
import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import type {RateLimiterMemory} from "rate-limiter-flexible";

import {AccountConfig} from "src/shared/model/account";
import {BaseConfig, Config} from "src/shared/model/options";
import {DbPatch} from "src/shared/api/common";
import {
    DEFAULT_API_CALL_TIMEOUT, DEFAULT_MESSAGES_STORE_PORTION_SIZE, ONE_MINUTE_MS, ONE_SECOND_MS, ZOOM_FACTOR_DEFAULT,
} from "src/shared/const";
import {FsDbAccount, View} from "src/shared/model/database";
import {LoginFieldContainer} from "src/shared/model/container";
import {StatusCodeError} from "src/shared/model/error";

// TODO split ./src/shared/util.ts to smaller utility files in subfolder

export function initialConfig(): Config {
    {
        const encryptionPreset: PasswordBasedPreset = {
            keyDerivation: {
                type: "sodium.crypto_pwhash",
                preset: BUILD_ENVIRONMENT === "e2e"
                    ? "mode:interactive|algorithm:default"
                    : "mode:moderate|algorithm:default"
            },
            encryption: {type: "crypto", preset: "algorithm:aes-256-cbc"},
        };

        return {
            spellcheck: false,
            spellcheckLanguages: [],
            encryptionPreset,
            window: {
                bounds: {width: 1024, height: 768},
                ...(BUILD_START_MAXIMIZED_BY_DEFAULT ? {maximized: true} : {}),
            },
            fetching: {
                rateLimit: {
                    intervalMs: ONE_MINUTE_MS,
                    maxInInterval: 300, // gave ~80 loaded messages per minute on ~6k messages account
                },
                messagesStorePortionSize: DEFAULT_MESSAGES_STORE_PORTION_SIZE,
            },
            timeouts: {
                // "fetchingRateLimiting" values need to be taking into the account defining the "fetching" timeout
                dbBootstrapping: ONE_MINUTE_MS * 60 * 12, // 12 hours
                dbSyncing: ONE_MINUTE_MS * 30, // 30 minutes
                webViewApiPing: ONE_SECOND_MS * 15,
                webViewBlankDOMLoaded: ONE_SECOND_MS * 15,
                domElementsResolving: ONE_SECOND_MS * 20,
                defaultApiCall: DEFAULT_API_CALL_TIMEOUT,
                databaseLoading: ONE_MINUTE_MS * 5, // 5 minutes
                indexingBootstrap: ONE_SECOND_MS * 30, // 30 seconds
                clearSessionStorageData: ONE_SECOND_MS * 3, // 3 seconds
                attachmentLoadAverage: ONE_MINUTE_MS * 2, // 2 minutes
                fullTextSearch: ONE_SECOND_MS * 30, // 30 seconds
            },
            updateCheck: {
                releasesUrl: "https://api.github.com/repos/vladimiry/ElectronMail/releases",
                proxyRules: "",
                proxyBypassRules: "",
            },
            indexingBootstrapBufferSize: 1000,
            jsFlags: [
                "--max-old-space-size=6144",
            ],
            commandLineSwitches: [],
            localDbMailsListViewMode: "plain",
            zoomFactorDisabled: false,
            persistentSessionSavingInterval: ONE_MINUTE_MS * 15,
            dbSyncingIntervalTrigger: ONE_MINUTE_MS * 5,
            dbSyncingOnlineTriggerDelay: ONE_SECOND_MS * 3,
            dbSyncingFiredTriggerDebounce: ONE_SECOND_MS * 5,
            shouldRequestDbMetadataReset: "initial",
            dbCompression: {
                type: BUILD_ENVIRONMENT === "e2e" ? "zstd" : "gzip",
                level: 7,
                mailsPortionSize: {min: 800, max: 1000},
            },
            dbMergeBytesFileSizeThreshold: 1024 * 1024 * 5, // 5 MB
            // base
            calendarNotification: false,
            checkUpdateAndNotify: false,
            customTrayIconColor: "",
            customTrayIconSize: false,
            customTrayIconSizeValue: 22,
            customUnreadBgColor: "",
            customUnreadTextColor: "",
            disableNotLoggedInTrayIndication: false,
            disableSpamNotifications: true,
            doNotRenderNotificationBadgeValue: false,
            enableHideControlsHotkey: false,
            findInPage: true,
            fullTextSearch: true,
            hideControls: false,
            hideOnClose: !BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE,
            idleTimeLogOutSec: 0,
            layoutMode: "top",
            logLevel: "error",
            startHidden: !BUILD_DISABLE_START_HIDDEN_FEATURE,
            themeSource: "system",
            unreadNotifications: true,
            zoomFactor: ZOOM_FACTOR_DEFAULT,
        };
    }
}

export const pickBaseConfigProperties = (
    config: Config,
): NoExtraProps<Required<BaseConfig>> => pick(
    config,
    keys<BaseConfig>(),
);

export const accountPickingPredicate: (criteria: LoginFieldContainer) => (account: AccountConfig) => boolean = ({login: criteriaLogin}) => {
    return ({login}) => login === criteriaLogin; // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
export function curryFunctionMembers<T extends object | ((...a: any[]) => any)>(
    src: T,
    ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
): T {
    const dest: T = typeof src === "function" // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        ? src.bind(undefined) :
        Object.create(null);
    for (const key of Object.getOwnPropertyNames(src)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const srcMember = (src as any)[key]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        (dest as any)[key] = typeof srcMember === "function" // eslint-disable-line @typescript-eslint/no-unsafe-member-access
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
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
    fn: (arg: { node: View.ConversationNode; mail?: View.ConversationNode["mail"] }) => void | "break",
): void {
    const state: { nodes: View.ConversationNode[] } = {nodes: [...rootNodes]};
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
    filter: (mail: View.Mail) => boolean = (): boolean => true,
): View.Mail[] {
    const result: View.Mail[] = [];

    walkConversationNodesTree(rootNodes, ({mail}) => {
        if (mail && filter(mail)) {
            result.push(mail);
        }
    });

    return result;
}

export function mailDateComparatorDefaultsToDesc(o1: View.Mail, o2: View.Mail, order: "desc" | "asc" = "desc"): number {
    return order === "desc"
        ? o2.sentDate - o1.sentDate
        : o1.sentDate - o2.sentDate;
}

// TODO consider using https://github.com/cedx/enum.js instead
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
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
        }, {
            values: [],
            names: [],
            valueNameMap: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        });

    const isValidValue = (value: unknown): value is V => {
        return (value as any) in valueNameMap; // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    interface ResolveNameByValue {
        (value: V): K;

        <S extends boolean>(value: V, strict: S): S extends true ? K : K | undefined;
    }

    const resolveNameByValue: ResolveNameByValue = (
        value: V,
        strict: boolean = true, // eslint-disable-line @typescript-eslint/no-inferrable-types
    ) => {
        if (strict && !isValidValue(value)) {
            throw new Error(`Failed to parse "${String(value)}" value from the "${JSON.stringify(nameValueMap)}" map`);
        }
        return valueNameMap[value];
    };

    interface ParseValue {
        (
            rawValue: any, // eslint-disable-line @typescript-eslint/no-explicit-any
        ): V;

        <S extends boolean>(
            rawValue: any, // eslint-disable-line @typescript-eslint/no-explicit-any
            strict: S,
        ): S extends true ? V : V | undefined;
    }

    const parseValue: ParseValue = (
        rawValue: any, // eslint-disable-line @typescript-eslint/no-explicit-any
        strict: boolean = true, // eslint-disable-line @typescript-eslint/no-inferrable-types
    ) => {
        const name = resolveNameByValue(rawValue, strict); // eslint-disable-line @typescript-eslint/no-unsafe-argument
        if (typeof name === "undefined") {
            return undefined as any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
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
            isValidValue,
        },
    } as const;
}

export function isDatabaseBootstrapped(
    metadata: DeepReadonly<FsDbAccount["metadata"]> | null,
): metadata is Readonly<Exclude<typeof metadata, null>> {
    if (!metadata) {
        return false;
    }
    return (
        typeof metadata.latestEventId === "string"
        &&
        Boolean(
            metadata.latestEventId.trim(),
        )
    );
}

export function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return min + Math.floor(Math.random() * (max - min)); // the maximum is exclusive and the minimum is inclusive
}

type validateLoginDelaySecondsRangeType = (
    loginDelaySecondsRange: string,
) => { validationError: string } | Required<AccountConfig>["loginDelaySecondsRange"];

export const validateLoginDelaySecondsRange: validateLoginDelaySecondsRangeType = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const re = /^(\d+)-(\d+)$/;
        const result: validateLoginDelaySecondsRangeType = (loginDelaySecondsRange) => {
            const match = re.exec(loginDelaySecondsRange) || [];
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
    }
)();

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-constraint
export function reduceDuplicateItemsFromArray<T extends any>(array: ReadonlyArray<T>): T[] {
    return [...new Set<T>(array).values()];
}

export const consumeMemoryRateLimiter = async (
    consume: () => ReturnType<typeof RateLimiterMemory.prototype.consume>,
): Promise<{ waitTimeMs: number }> => {
    try {
        await consume();
        return {waitTimeMs: 0};
    } catch (_error) {
        const error = _error as ({ msBeforeNext?: unknown } | Unpacked<ReturnType<typeof RateLimiterMemory.prototype.consume>>);
        if (typeof error === "object" && typeof error.msBeforeNext === "number") {
            return {waitTimeMs: error.msBeforeNext};
        }
        throw error;
    }
};

export const assertTypeOf = (
    {value, expectedType}: {
        value: unknown
        expectedType: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function"
    },
    errorMessagePrefix: string,
): void | never => {
    const actualType = typeof value;
    if (actualType !== expectedType) {
        throw new Error(`${errorMessagePrefix} ${JSON.stringify({actualType, expectedType: expectedType})}`);
    }
};

export const lowerConsoleMessageEventLogLevel = (
    logLevel: "error" | "warn",
    message: string,
): typeof logLevel => {
    if (String(message).includes("OfflineError: No network connection")) {
        return "warn";
    }
    return logLevel;
};

export const buildInitialVendorsAppCssLinks = (
    hrefs: ReadonlyArray<string>,
    shouldUseDarkColors?: boolean,
): string => {
    return hrefs.reduce(
        (accumulator, value) => {
            const stylesheet: boolean = (
                typeof shouldUseDarkColors !== "boolean"
                ||
                (value.endsWith("-dark.css") && shouldUseDarkColors)
                ||
                (value.endsWith("-light.css") && !shouldUseDarkColors)
            );
            return (
                accumulator
                +
                `<link ${stylesheet ? 'rel="stylesheet"' : 'rel="preload" as="style"'} href="${value}"/>`
            );
        },
        "",
    );
};

export const getPlainErrorProps = <T extends unknown>( // eslint-disable-line @typescript-eslint/no-unnecessary-type-constraint
    value: T,
): T | { code?: string, name?: string, message?: string, stack?: string } => {
    if (value === null) {
        return {message: `stringified "null"`};
    }
    if (typeof value === "undefined") {
        return {message: `stringified "undefined"`};
    }
    if (typeof value !== "object") {
        return value;
    }
    // TODO consider also iterating "own string" props
    return {
        ...mapValues(
            pick(
                Object(value) as unknown as { code?: unknown, name?: unknown, message?: unknown, stack?: unknown },
                ["code", "message", "name", "stack"],
            ),
            String,
        ),
    };
};
