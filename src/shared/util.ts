import {PasswordBasedPreset} from "fs-json-store-encryption-adapter";
import type {RateLimiterMemory} from "rate-limiter-flexible";
import {URL} from "@cliqz/url-parser";
import {pick} from "remeda";

import {
    ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN,
    DEFAULT_API_CALL_TIMEOUT,
    DEFAULT_MESSAGES_STORE_PORTION_SIZE,
    LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN,
    ONE_MINUTE_MS,
    ONE_SECOND_MS,
    PROVIDER_REPO_MAP,
    PROVIDER_REPO_NAMES,
    WEB_CLIENTS_BLANK_HTML_FILE_NAME,
    ZOOM_FACTOR_DEFAULT,
} from "src/shared/constants";
import {AccountConfig} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {DbPatch} from "./api/common";
import {FsDbAccount, View} from "src/shared/model/database";
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
                proxy: "",
            },
            indexingBootstrapBufferSize: 1000,
            jsFlags: [
                "--max-old-space-size=3072",
            ],
            localDbMailsListViewMode: "plain",
            userAgents: [
                /* eslint-disable max-len */
                "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 YaBrowser/18.3.1.1232 Yowser/2.5 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36 OPR/56.0.3051.52",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36 Edg/80.0.361.69",
                "Mozilla/5.0 (X11; CrOS x86_64 12739.111.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Safari/537.36",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4102.3 Safari/537.36",
                "Mozilla/5.0 CK={} (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko",
                /* eslint-enable max-len */
            ],
            zoomFactorDisabled: false,
            // base
            calendarNotification: false,
            checkUpdateAndNotify: false,
            customTrayIconColor: "",
            customUnreadBgColor: "",
            customUnreadTextColor: "",
            disableSpamNotifications: true,
            doNotRenderNotificationBadgeValue: false,
            enableHideControlsHotkey: false,
            findInPage: true,
            fullTextSearch: true,
            hideControls: false,
            hideOnClose: true,
            idleTimeLogOutSec: 0,
            layoutMode: "top",
            logLevel: "error",
            startHidden: true,
            unreadNotifications: true,
            zoomFactor: ZOOM_FACTOR_DEFAULT,
        };
    }
}

export const pickBaseConfigProperties = (
    config: Config,
): NoExtraProps<Required<BaseConfig>> => pick(
    config,
    [
        "calendarNotification",
        "checkUpdateAndNotify",
        "customTrayIconColor",
        "customUnreadBgColor",
        "customUnreadTextColor",
        "disableSpamNotifications",
        "doNotRenderNotificationBadgeValue",
        "enableHideControlsHotkey",
        "findInPage",
        "fullTextSearch",
        "hideControls",
        "hideOnClose",
        "idleTimeLogOutSec",
        "layoutMode",
        "logLevel",
        "startHidden",
        "unreadNotifications",
        "zoomFactor",
    ],
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
        const name = resolveNameByValue(rawValue, strict);
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

export const getWebViewPartition: (login: AccountConfig["login"]) => string = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const prefix = "memory/";
        const result: typeof getWebViewPartition = (login) => `${prefix}${login}`;

        return result;
    }
)();

export const validateLoginDelaySecondsRange: (
    loginDelaySecondsRange: string,
) => { validationError: string } | Required<AccountConfig>["loginDelaySecondsRange"] = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const re = /^(\d+)-(\d+)$/;
        const result: typeof validateLoginDelaySecondsRange = (loginDelaySecondsRange) => {
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

export const parseLoginDelaySecondsRange: (
    loginDelaySecondsRange: string,
) => Required<AccountConfig>["loginDelaySecondsRange"] | undefined = (loginDelaySecondsRange) => {
    const validation = validateLoginDelaySecondsRange(loginDelaySecondsRange);

    if ("validationError" in validation) {
        return;
    }

    return validation;
};

export const validateExternalContentProxyUrlPattern = (
    {
        externalContentProxyUrlPattern: value,
        enableExternalContentProxy: enabled,
    }: Pick<NoExtraProps<DeepReadonly<AccountConfig>>, "externalContentProxyUrlPattern" | "enableExternalContentProxy">,
): boolean => {
    if (!enabled && !value) { // empty value allowed if feature not enabled
        return true;
    }

    if (!value) {
        return false;
    }

    const parsedUrl = (() => {
        try {
            const url = new URL(value);
            return {
                origin: parseUrlOriginWithNullishCheck(value),
                ...pick(url, ["pathname", "search"]),
            };
        } catch {
            return null;
        }
    })();

    return Boolean(
        parsedUrl
        &&
        (
            parsedUrl.origin
            &&
            !parsedUrl.origin.includes(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN)
        )
        &&
        [parsedUrl.pathname, parsedUrl.search]
            .filter((valuePart) => valuePart.includes(ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN))
            .length === 1
    );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function removeDuplicateItems<T extends any>(array: ReadonlyArray<T>): T[] {
    return [...new Set<T>(array).values()];
}

export function normalizeLocale(value: string): string {
    return value.replace(/[^A-Za-z]/g, "_");
}

// - Breaking changes: https://github.com/mrmlnc/fast-glob/releases/tag/3.0.0
// - How to write patterns on Windows: https://github.com/mrmlnc/fast-glob
export function sanitizeFastGlobPattern(pattern: string): string {
    return pattern.replace(/\\/g, "/");
}

export const parsePackagedWebClientUrl: (
    urlArg: string,
) => (null | Readonly<Pick<URL, "protocol" | "hostname" | "pathname">>) = (
    () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const re = new RegExp(`^(${LOCAL_WEBCLIENT_PROTOCOL_RE_PATTERN}:)`);
        const result: typeof parsePackagedWebClientUrl = (urlArg) => {
            if (!re.exec(urlArg)) {
                return null;
            }

            const url = new URL(urlArg);

            // if (!re.exec(url.protocol)) {
            //     return false;
            // }

            return pick(url, ["protocol", "hostname", "pathname"]);
        };
        return result;
    }
)();

export const resolvePackagedWebClientApp: (
    url: Exclude<ReturnType<typeof parsePackagedWebClientUrl>, null>,
) => Readonly<{ project: keyof typeof PROVIDER_REPO_MAP; projectSubPath?: string }> = (
    () => {  // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        const subProjects = PROVIDER_REPO_NAMES.filter((projectType) => projectType !== "proton-mail");
        const result: typeof resolvePackagedWebClientApp = (url) => {
            const pathname = `${url.pathname}/`;
            const foundSubProject = subProjects.find((subProject) => {
                return pathname.startsWith(`/${PROVIDER_REPO_MAP[subProject].baseDirName}/`);
            });
            const project = foundSubProject || "proton-mail";
            const [
                /* "," does skip the first item since it's a "project" itself: */,
                ...projectSubPathParts
            ] = pathname.split("/").filter(Boolean);
            const projectSubPath = projectSubPathParts.length
                ? projectSubPathParts.join("/")
                : undefined;

            return {project, projectSubPath};
        };
        return result;
    }
)();

const testProtonAppPage = (
    targetProjectType: keyof typeof PROVIDER_REPO_MAP,
    {url, logger}: { url: string; logger: import("src/shared/model/common").Logger },
): {
    shouldInitProviderApi: boolean
    blankHtmlPage: boolean
    packagedWebClientUrl: ReturnType<typeof parsePackagedWebClientUrl>
    projectType?: keyof typeof PROVIDER_REPO_MAP,
} => {
    let projectType: keyof typeof PROVIDER_REPO_MAP | undefined;
    const packagedWebClientUrl = parsePackagedWebClientUrl(url);
    const blankHtmlPage = packagedWebClientUrl?.pathname === `/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}`;
    const protonMailProject = Boolean(
        !blankHtmlPage
        &&
        packagedWebClientUrl
        &&
        (projectType = resolvePackagedWebClientApp(packagedWebClientUrl).project) === targetProjectType
    );
    const result = {
        shouldInitProviderApi: protonMailProject,
        blankHtmlPage,
        packagedWebClientUrl,
        projectType,
    } as const;

    logger.verbose("testProtonAppPage()", JSON.stringify({...result, url, projectType}));

    return result;
};

export const testProtonMailAppPage = (
    params: { url: string; logger: import("src/shared/model/common").Logger },
): ReturnType<typeof testProtonAppPage> & { shouldDisableBrowserNotificationFeature: boolean } => {
    const baseResult = testProtonAppPage("proton-mail", params);

    return {
        ...baseResult,
        shouldDisableBrowserNotificationFeature: baseResult.shouldInitProviderApi,
    };
};

export const testProtonCalendarAppPage = (
    params: { url: string; logger: import("src/shared/model/common").Logger },
): ReturnType<typeof testProtonAppPage> => {
    return testProtonAppPage("proton-calendar", params);
};

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

export const verifyUrlOriginValue = (origin: string): string | never => {
    if (
        !origin
        ||
        // browsers resolve "new URL(...).origin" of custom schemes as "null" string value
        // example: new URL("webclient://domain.net/blank.html?loader-id=2fb1c580").origin
        String(origin).trim() === "null"
    ) {
        throw new Error(`Unexpected "origin" value detected (value: "${JSON.stringify({origin: String(origin)})}")`);
    }

    return origin;
};

export const parseUrlOriginWithNullishCheck = (url: string): string | never => {
    const {origin} = new URL(url);

    verifyUrlOriginValue(origin);

    return origin;
};

export const buildUrlOriginsFailedMsgTester: (
    // array item can be either url or already parsed origin (mixed array item types allowed)
    // since each array item value get parsed/verified by the function
    originsOrUrlsWhitelist: readonly string[],
) => (url: string) => null | string = (() => {
    const result: typeof buildUrlOriginsFailedMsgTester = (allowedOriginsOrUrls) => {
        const originsWhitelist = allowedOriginsOrUrls.map(parseUrlOriginWithNullishCheck);
        return (url: string) => {
            const urlOrigin = parseUrlOriginWithNullishCheck(url);
            return originsWhitelist.includes(urlOrigin)
                ? null
                : `No matched value found in ${JSON.stringify(originsWhitelist)} URL origins list for "${urlOrigin}" value.`;
        };
    };
    return result;
})();
