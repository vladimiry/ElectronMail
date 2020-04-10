import asap from "asap-es";
import {v4 as uuid} from "uuid";

import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {ROLLING_RATE_LIMITER} from "src/electron-preload/lib/electron-exposure/rolling-rate-limiter";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {asyncDelay, curryFunctionMembers} from "src/shared/util";
import {resolveIpcMainApi} from "src/electron-preload/webview/lib/util";

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
    messageModel: (message: RestModel.Message) => {
        clearTextBody: () => Promise<string>;
    };
    conversation: {
        get: (id: RestModel.Conversation["ID"]) => Promise<{ data: RestModel.ConversationResponse }>;
        query: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Conversation["LabelIDs"]> },
        ) => Promise<{ data: RestModel.ConversationsResponse }>;
    };
    message: {
        get: (id: RestModel.Message["ID"]) => Promise<{ data: RestModel.MessageResponse }>;
        query: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Message["LabelIDs"]> },
        ) => Promise<RestModel.MessagesResponse>;
        read: (params: { IDs: ReadonlyArray<RestModel.Message["ID"]> }) => Promise<void>;
        label: (params: { LabelID: RestModel.Label["ID"]; IDs: ReadonlyArray<RestModel.Message["ID"]> }) => Promise<void>;
    };
    contact: {
        get: (id: RestModel.Contact["ID"]) => Promise<RestModel.ContactResponse["Contact"]>;
        all: () => Promise<RestModel.ContactsResponse["Contacts"]>;
    };
    label: {
        query: (params?: { Type?: RestModel.Label["Type"] }) => Promise<RestModel.LabelsResponse["Labels"]>;
    };
    events: {
        get: (id: RestModel.Event["EventID"], config?: ng.IRequestShortcutConfig) => Promise<RestModel.EventResponse>;
        getLatestID: () => Promise<RestModel.LatestEventResponse>;
    };
    vcard: {
        // TODO proper "vcard" model definition
        from: (vcfString: string) => {
            version: string;
            data: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        };
    };
}

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[lib/api]");
const resolveServiceLogger = curryFunctionMembers(logger, "resolveService()");
const rateLimitedApiCallingQueue = new asap();
const state: { api?: Promise<ProviderApi> } = {};

let rateLimitedMethodsCallCount = 0;

function resolveService<T extends ProviderApi[keyof ProviderApi]>(
    injector: ng.auto.IInjectorService,
    serviceName: string,
    rateLimiting?: Readonly<{
        rateLimiterTick: () => number;
        rateLimitedMethodNames: Array<keyof KeepAsyncFunctionsProps<T>>;
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

        clonedService[rateLimitedMethodName] = async function(
            this: typeof service,
            ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
        ) {
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

                const result = originalMethod.apply(service, args);

                rateLimitedMethodsCallCount++;

                return result; // eslint-disable-line @typescript-eslint/no-unsafe-return
            });
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    return clonedService;
}

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
                rateLimitedMethodNames: ["get", "query"/*, "read"*/ /*, "label"*/],
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
    [K in keyof T]: T[K] extends (args: any) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
        ? T[K]
        : never
};
