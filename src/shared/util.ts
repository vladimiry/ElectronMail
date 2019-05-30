import {AccountConfig, AccountType} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {DbPatch} from "./api/common";
import {LoginFieldContainer} from "./model/container";
import {MemoryDbAccount, View} from "src/shared/model/database";
import {StatusCodeError} from "./model/error";

export function pickBaseConfigProperties(
    {
        checkForUpdatesAndNotify,
        clearSession,
        closeToTray,
        compactLayout,
        customUnreadBgColor,
        customUnreadTextColor,
        disableGpuProcess,
        disableSpamNotifications,
        findInPage,
        fullTextSearch,
        logLevel,
        startMinimized,
        unreadNotifications,
    }: Config,
): Required<BaseConfig> {
    return {
        checkForUpdatesAndNotify: !!checkForUpdatesAndNotify,
        clearSession: !!clearSession,
        closeToTray: !!closeToTray,
        compactLayout: !!compactLayout,
        customUnreadBgColor: customUnreadBgColor || "",
        customUnreadTextColor: customUnreadTextColor || "",
        disableGpuProcess: !!disableGpuProcess,
        disableSpamNotifications: !!disableSpamNotifications,
        findInPage: !!findInPage,
        fullTextSearch: !!fullTextSearch,
        logLevel,
        startMinimized: !!startMinimized,
        unreadNotifications: !!unreadNotifications,
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
    return await new Promise<T | void>((resolve) => {
        setTimeout(() => typeof resolveAction === "function" ? resolve(resolveAction()) : resolve(), pauseTimeMs);
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

        if (typeof srcMember === "function") {
            (dest as any)[key] = srcMember.bind(src, ...args);
        }
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
export function buildEnumBundle<V extends string | number = string>(
    nameValueMap: { [k: string]: V },
) {
    type M = typeof nameValueMap;

    const {names, values, valueNameMap} = Object
        .entries(nameValueMap)
        .reduce((accumulator: { names: Array<keyof M>; values: V[]; valueNameMap: { [k in V]: string } }, [key, value]) => {
            accumulator.names.push(key);
            accumulator.values.push(value as V);
            accumulator.valueNameMap[value] = key;
            return accumulator;
        }, {values: [], names: [], valueNameMap: {} as any});

    interface ResolveNameByValue {
        (value: V): string;

        <S extends boolean>(value: V, strict: S): S extends true ? string : string | undefined;
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

    const parseValue: ParseValue = (rawValue: any, strict: boolean = true) => nameValueMap[resolveNameByValue(rawValue, strict) as string];

    // TODO deep freeze the result object
    return Object.assign(
        {
            _: {resolveNameByValue, parseValue, names, values, nameValueMap},
        },
        nameValueMap,
    );
}

export function isDatabaseBootstrapped(
    metadata: MemoryDbAccount["metadata"] | null,
): metadata is Readonly<Exclude<typeof metadata, null>> {
    if (!metadata) {
        return false;
    }

    return metadata.type === "protonmail"
        ? Boolean(metadata.latestEventId)
        : Boolean(Object.keys(metadata.groupEntityEventBatchIds || {}).length);
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
