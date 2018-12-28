import {AccountConfig} from "./model/account";
import {BaseConfig, Config} from "./model/options";
import {DbPatch} from "./api/common";
import {LoginFieldContainer} from "./model/container";
import {StatusCodeError} from "./model/error";
import {View} from "src/shared/model/database";

export function pickBaseConfigProperties(
    {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify, logLevel, findInPage}: Config,
): Required<BaseConfig> {
    return {closeToTray, compactLayout, startMinimized, unreadNotifications, checkForUpdatesAndNotify, logLevel, findInPage};
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

export const curryFunctionMembers = <T extends any>(src: T, ...args: any[]): T => {
    const dest: T = typeof src === "function" ? src.bind(undefined) : {};
    for (const key of Object.getOwnPropertyNames(src)) {
        const srcMember = src[key];
        if (typeof srcMember === "function") {
            dest[key] = srcMember.bind(undefined, ...args);
        }
    }
    return dest;
};

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

export function walkConversationNodesTree(rootNodes: View.ConversationNode[], fn: (node: View.ConversationNode) => void): void {
    const state: { nodes: View.ConversationNode[]; } = {nodes: [...rootNodes]};

    while (state.nodes.length) {
        const node = state.nodes.pop();

        if (!node) {
            continue;
        }

        fn(node);

        state.nodes.unshift(...[...node.children]);
    }
}

export function mailDateDescComparator(o1: View.Mail, o2: View.Mail) {
    return o2.sentDate - o1.sentDate;
}

export function sortMails(
    mails: View.Mail[],
    comparator: (o1: View.Mail, o2: View.Mail) => number = mailDateDescComparator,
): typeof mails {
    return [...mails].sort(comparator);
}

export function reduceNodesMails(
    nodes: View.ConversationNode[],
    mailFilter: (mail: View.Mail) => boolean = () => true,
): View.Mail[] {
    const mails: View.Mail[] = [];

    walkConversationNodesTree(nodes, (node) => {
        if (!node.mail || !mailFilter(node.mail)) {
            return;
        }
        mails.push(node.mail);
    });

    return mails;
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
