import asap from "asap-es";
import {v4 as uuid} from "uuid";

import * as Rest from "./rest";
import {ROLLING_RATE_LIMITER} from "src/electron-preload/electron-exposure/rolling-rate-limiter";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {asyncDelay, curryFunctionMembers} from "src/shared/util";
import {resolveIpcMainApi} from "src/electron-preload/webview/util";

// TODO consider executing direct $http calls
// in order to not depend on Protonmail WebClient's AngularJS factories/services
export interface ProviderApi {
    constants: {
        MESSAGE_VIEW_MODE: 1;
        CONVERSATION_VIEW_MODE: 0;
    };
    $http: ng.IHttpService;
    url: {
        build: (module: string) => () => string;
    };
    lazyLoader: {
        app: () => Promise<void>;
    };
    mailSettingsModel: {
        get: () => {
            ViewMode:
                | ProviderApi["constants"]["MESSAGE_VIEW_MODE"]
                | ProviderApi["constants"]["CONVERSATION_VIEW_MODE"];
        };
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
        read: (params: { IDs: ReadonlyArray<Rest.Model.Message["ID"]> }) => Promise<void>;
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
const rateLimitedApiCallingQueue = new asap();
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
            const {fetching: {rateLimit: rateLimitConfig}} = await (await resolveIpcMainApi(logger))("readConfig")();
            const limiter = ROLLING_RATE_LIMITER({
                interval: rateLimitConfig.intervalMs,
                maxInInterval: rateLimitConfig.maxInInterval,
            });
            const key = `webview:protonmail-api:${uuid()}`;

            logger.verbose(JSON.stringify({rateLimitConfig}));

            return () => limiter(key);
        })(),
    } as const;

    return state.api = (async () => {
        const injector = window.angular && window.angular.element(document.body).injector();

        if (!injector) {
            throw new Error(`Failed to resolve "$injector" service`);
        }

        const lazyLoader = resolveService<ProviderApi["lazyLoader"]>(injector, "lazyLoader");

        await lazyLoader.app();

        // TODO validate types of all the described constants/functions in a declarative way
        // so app gets protonmail breaking changes noticed on early stage

        return {
            constants: {
                // TODO TS: get rid of type casting
                MESSAGE_VIEW_MODE: 1 as ProviderApi["constants"]["MESSAGE_VIEW_MODE"],
                CONVERSATION_VIEW_MODE: 0 as ProviderApi["constants"]["CONVERSATION_VIEW_MODE"],
            },
            lazyLoader,
            mailSettingsModel: resolveService<ProviderApi["mailSettingsModel"]>(injector, "mailSettingsModel"),
            $http: resolveService<ProviderApi["$http"]>(injector, "$http"),
            url: resolveService<ProviderApi["url"]>(injector, "url"),
            messageModel: resolveService<ProviderApi["messageModel"]>(injector, "messageModel"),
            conversation: resolveService<ProviderApi["conversation"]>(injector, "conversationApi", {
                ...rateLimiting,
                rateLimitedMethodNames: ["get", "query"],
            }),
            message: resolveService<ProviderApi["message"]>(injector, "messageApi", {
                ...rateLimiting,
                rateLimitedMethodNames: ["get", "query"/*, "read"*/],
            }),
            contact: resolveService<ProviderApi["contact"]>(injector, "Contact", {
                ...rateLimiting,
                rateLimitedMethodNames: ["get", "all"],
            }),
            label: resolveService<ProviderApi["label"]>(injector, "Label", {
                ...rateLimiting,
                rateLimitedMethodNames: ["query"],
            }),
            events: resolveService<ProviderApi["events"]>(injector, "Events", {
                ...rateLimiting,
                rateLimitedMethodNames: ["get", "getLatestID"],
            }),
            vcard: resolveService<ProviderApi["vcard"]>(injector, "vcard"),
        };
    })();
}

type KeepAsyncFunctionsProps<T> = {
    [K in keyof T]: T[K] extends (args: any) => Promise<any> ? T[K] : never
};

function resolveService<T extends ProviderApi[keyof ProviderApi]>(
    injector: ng.auto.IInjectorService,
    serviceName: string,
    rateLimiting?: Readonly<{
        rateLimiterTick: () => number;
        rateLimitedMethodNames: Array<keyof KeepAsyncFunctionsProps<T>>,
    }>,
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

    for (const rateLimitedMethodName of rateLimiting.rateLimitedMethodNames) {
        const originalMethod = clonedService[rateLimitedMethodName];
        const _fullMethodName = `${serviceName}.${rateLimitedMethodName}`;

        if (typeof originalMethod !== "function") {
            throw new Error(`Not a function: "${_fullMethodName}"`);
        }

        clonedService[rateLimitedMethodName] = async function(this: typeof service) {
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

            return rateLimitedApiCallingQueue.q(() => {
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
