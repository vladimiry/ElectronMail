import UUID from "pure-uuid";
import asap from "asap-es";

import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {ONE_SECOND_MS} from "src/shared/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {asyncDelay, consumeMemoryRateLimiter, curryFunctionMembers} from "src/shared/util";
import {resolveIpcMainApi} from "src/electron-preload/webview/lib/util";

// TODO get rid of require "rate-limiter-flexible/lib/RateLimiterMemory" import
//      ES import makes the build fail in "web" context since webpack attempts to bundle the whole library which requires "node" context
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const RateLimiterMemory: typeof import("rate-limiter-flexible")["RateLimiterMemory"]
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    = require("rate-limiter-flexible/lib/RateLimiterMemory");

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
    attachmentLoader: {
        get: (attachment: RestModel.Attachment, message: RestModel.Message) => Promise<Uint8Array>;
    },
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
        consume: () => ReturnType<typeof RateLimiterMemory.prototype.consume>;
        methodNames: Array<keyof KeepAsyncFunctionsProps<T>>;
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

    const clonedService = {...service};

    for (const rateLimitedMethodName of rateLimiting.methodNames) {
        const originalMethod = clonedService[rateLimitedMethodName];
        const _fullMethodName = `${serviceName}.${String(rateLimitedMethodName)}`;

        if (typeof originalMethod !== "function") {
            throw new Error(`Not a function: "${_fullMethodName}"`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        clonedService[rateLimitedMethodName] = async function(
            this: typeof service,
            ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
        ) {
            const {waitTimeMs} = await consumeMemoryRateLimiter(rateLimiting.consume);

            if (waitTimeMs > 0) {
                resolveServiceLogger.info(
                    `delaying rate limited method calling: ${_fullMethodName} ${JSON.stringify({waitTimeMs, rateLimitedMethodsCallCount})}`,
                );
                await asyncDelay(waitTimeMs);
            }

            resolveServiceLogger.debug(`queueing rate limited method: "${_fullMethodName}"`);

            return rateLimitedApiCallingQueue.q(() => {
                resolveServiceLogger.verbose(
                    `calling rate limited method: ${_fullMethodName} ${JSON.stringify({waitTimeMs, rateLimitedMethodsCallCount})}`,
                );

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
        consume: await (async () => {
            const {fetching: {rateLimit: rateLimitConfig}} = await (await resolveIpcMainApi(logger))("readConfig")();
            const limiter = new RateLimiterMemory({
                points: rateLimitConfig.maxInInterval,
                duration: rateLimitConfig.intervalMs / ONE_SECOND_MS, // seconds value
            });
            const key = `webview:protonmail-api:${new UUID(4).format()}`;
            logger.verbose(JSON.stringify({rateLimitConfig}));
            return async () => limiter.consume(key);
        })(),
    } as const;

    return state.api = (async (): Promise<ProviderApi> => {
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
                methodNames: ["get", "query"],
            }),
            message: resolveService<ProviderApi["message"]>(injector, "messageApi", {
                ...rateLimiting,
                methodNames: ["get", "query"/*, "read"*/ /*, "label"*/],
            }),
            contact: resolveService<ProviderApi["contact"]>(injector, "Contact", {
                ...rateLimiting,
                methodNames: ["get", "all"],
            }),
            label: resolveService<ProviderApi["label"]>(injector, "Label", {
                ...rateLimiting,
                methodNames: ["query"],
            }),
            events: resolveService<ProviderApi["events"]>(injector, "Events", {
                ...rateLimiting,
                methodNames: ["get", "getLatestID"],
            }),
            vcard: resolveService<ProviderApi["vcard"]>(injector, "vcard"),
            attachmentLoader: resolveService<ProviderApi["attachmentLoader"]>(injector, "AttachmentLoader", {
                ...rateLimiting,
                methodNames: ["get"],
            }),
        };
    })();
}

type KeepAsyncFunctionsProps<T> = {
    [K in keyof T]: T[K] extends (args: any) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
        ? T[K]
        : never
};
