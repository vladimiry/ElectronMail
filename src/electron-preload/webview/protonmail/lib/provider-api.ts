import PQueue from "p-queue";
import rateLimiter from "rolling-rate-limiter";
import {v4 as uuid} from "uuid";

import * as Rest from "./rest";
import {Unpacked} from "src/shared/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {asyncDelay, curryFunctionMembers} from "src/shared/util";
import {resolveIpcMainApi} from "src/electron-preload/webview/util";

// TODO consider executing direct $http calls
// in order to not depend on Protonmail WebClient's AngularJS factories/services
export interface ProviderApi {
    $http: ng.IHttpService;
    url: {
        build: (module: string) => () => string;
    };
    lazyLoader: {
        app: () => Promise<void>;
    };
    messageModel: (message: Rest.Model.Message) => {
        clearTextBody: () => Promise<string>;
    };
    conversation: {
        get: (id: Rest.Model.Conversation["ID"]) => Promise<{ data: Rest.Model.ConversationResponse }>;
        query: (
            params?: Rest.Model.QueryParams & { LabelID?: Unpacked<Rest.Model.Conversation["LabelIDs"]> },
        ) => Promise<{ data: Rest.Model.ConversationsResponse }>;
    };
    message: {
        get: (id: Rest.Model.Message["ID"]) => Promise<{ data: Rest.Model.MessageResponse }>;
        query: (
            params?: Rest.Model.QueryParams & { LabelID?: Unpacked<Rest.Model.Message["LabelIDs"]> },
        ) => Promise<Rest.Model.MessagesResponse>;
    };
    contact: {
        get: (id: Rest.Model.Contact["ID"]) => Promise<Rest.Model.ContactResponse["Contact"]>;
        all: () => Promise<Rest.Model.ContactsResponse["Contacts"]>;
    };
    label: {
        query: (params?: { Type?: Rest.Model.Label["Type"] }) => Promise<Rest.Model.LabelsResponse["Labels"]>;
    };
    events: {
        get: (id: Rest.Model.Event["EventID"], config?: ng.IRequestShortcutConfig) => Promise<Rest.Model.EventResponse>;
        getLatestID: () => Promise<Rest.Model.LatestEventResponse>;
    };
    vcard: {
        // TODO proper "vcard" model definition
        from: (vcfString: string) => { version: string; data: Record<string, any> };
    };
}

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[lib/api]");
const resolveServiceLogger = curryFunctionMembers(logger, "resolveService()");
const rateLimitedApiCallingQueue: PQueue<PQueue.DefaultAddOptions> = new PQueue({concurrency: 1});
const state: { api?: Promise<ProviderApi> } = {};

let rateLimitedMethodsCallCount = 0;

export async function resolveProviderApi(): Promise<ProviderApi> {
    if (state.api) {
        logger.debug(`resolveProviderApi()`);
        return state.api;
    }

    logger.info(`resolveProviderApi()`);

    const rateLimiting = {
        rateLimiterTick: await (async () => {
            const {fetching: {rateLimit: rateLimitConfig}} = await (await resolveIpcMainApi())("readConfig")().toPromise();
            logger.debug(JSON.stringify({rateLimitConfig}));
            const limiter = rateLimiter({
                interval: rateLimitConfig.intervalMs,
                maxInInterval: rateLimitConfig.maxInInterval,
            });
            const key = `webview:protonmail-api:${uuid()}`;
            return () => limiter(key);
        })(),
    };

    return state.api = (async () => {
        const injector = window.angular.element(document.body).injector();

        if (!injector) {
            throw new Error(`Failed to resolve "injector" variable`);
        }

        const lazyLoader = resolveService<ProviderApi["lazyLoader"]>(injector, "lazyLoader");

        await lazyLoader.app();

        // TODO validate types of all the described constants/functions in a declarative way
        // so app gets protonmail breaking changes noticed on early stage

        return {
            lazyLoader,
            $http: resolveService<ProviderApi["$http"]>(injector, "$http"),
            url: resolveService<ProviderApi["url"]>(injector, "url"),
            messageModel: resolveService<ProviderApi["messageModel"]>(injector, "messageModel"),
            conversation: resolveService<ProviderApi["conversation"]>(injector, "conversationApi", {
                ...rateLimiting,
                methods: ["get", "query"],
            }),
            message: resolveService<ProviderApi["message"]>(injector, "messageApi", {
                ...rateLimiting,
                methods: ["get", "query"],
            }),
            contact: resolveService<ProviderApi["contact"]>(injector, "Contact", {
                ...rateLimiting,
                methods: ["get", "all"],
            }),
            label: resolveService<ProviderApi["label"]>(injector, "Label", {
                ...rateLimiting,
                methods: ["query"],
            }),
            events: resolveService<ProviderApi["events"]>(injector, "Events", {
                ...rateLimiting,
                methods: ["get", "getLatestID"],
            }),
            vcard: resolveService<ProviderApi["vcard"]>(injector, "vcard"),
        };
    })();
}

type KeepAsyncFunctionsProps<T> = {
    [K in keyof T]: T[K] extends (args: any) => Promise<infer U> ? T[K] : never
};

function resolveService<T extends ProviderApi[keyof ProviderApi]>(
    injector: ng.auto.IInjectorService,
    serviceName: string,
    rateLimiting?: {
        rateLimiterTick: () => number;
        methods: Array<keyof KeepAsyncFunctionsProps<T>>,
    },
): T {
    resolveServiceLogger.info();
    const service = injector.get<T | undefined>(serviceName);

    if (!service) {
        throw new Error(`Failed to resolve "${serviceName}" service`);
    }

    resolveServiceLogger.verbose(`"${serviceName}" keys`, JSON.stringify(Object.keys(service)));

    if (!rateLimiting) {
        return service;
    }

    const clonedService = {...service} as T;

    for (const method of rateLimiting.methods) {
        const originalMethod = clonedService[method];
        const _fullMethodName = `${serviceName}.${method}`;

        if (typeof originalMethod !== "function") {
            throw new Error(`Not a function: "${_fullMethodName}"`);
        }

        clonedService[method] = async function(this: typeof service) {
            const originalMethodArgs = arguments;
            const waitTime = rateLimiting.rateLimiterTick();
            const limitExceeded = waitTime > 0;

            if (limitExceeded) {
                resolveServiceLogger.info(
                    `delaying rate limited method calling: ${_fullMethodName} ${JSON.stringify({waitTime, rateLimitedMethodsCallCount})}`,
                );

                await asyncDelay(waitTime);
            }

            resolveServiceLogger.debug(`queueing rate limited method: "${_fullMethodName}"`);

            return rateLimitedApiCallingQueue.add(() => {
                resolveServiceLogger.verbose(
                    `calling rate limited method: ${_fullMethodName} ${JSON.stringify({waitTime, rateLimitedMethodsCallCount})}`,
                );

                const result = originalMethod.apply(service, originalMethodArgs);
                rateLimitedMethodsCallCount++;
                return result;
            });
        } as any;
    }

    return clonedService;
}
