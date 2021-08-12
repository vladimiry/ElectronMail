import UUID from "pure-uuid";
import asap from "asap-es";

import {Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/constants";
import {PROVIDER_APP_NAMES} from "src/shared/proton-apps-constants";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {assertTypeOf, asyncDelay, consumeMemoryRateLimiter, curryFunctionMembers} from "src/shared/util";
import {resolveCachedConfig} from "src/electron-preload/lib/util";

// TODO get rid of require "rate-limiter-flexible/lib/RateLimiterMemory" import
//      ES import makes the build fail in "web" context since webpack attempts to bundle the whole library which requires "node" context
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const RateLimiterMemory: typeof import("rate-limiter-flexible")["RateLimiterMemory"]
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    = require("rate-limiter-flexible/lib/RateLimiterMemory");

export const attachRateLimiting = async (api: ProviderApi, logger_: Logger): Promise<void> => {
    const logger = curryFunctionMembers(logger_, nameof(attachRateLimiting));
    const callingQueue = new asap(/* 3 TODO allow concurrent API requests */);
    const state: NoExtraProps<{ callsCount: number }> = {callsCount: 0};
    const consumeRateLimiting = await (async () => {
        const {fetching: {rateLimit: rateLimitConfig}} = await resolveCachedConfig(logger);
        const limiter = new RateLimiterMemory({
            points: rateLimitConfig.maxInInterval,
            duration: rateLimitConfig.intervalMs / ONE_SECOND_MS, // seconds value
        });
        const repoType: typeof PROVIDER_APP_NAMES[0] = "proton-mail";
        const key = `[WEBVIEW:${repoType}]:${new UUID(4).format()}`;
        logger.verbose(JSON.stringify({rateLimitConfig}));
        return async () => limiter.consume(key);
    })();
    const attach = <A extends ProviderApi, K extends keyof A, I extends ReadonlyArray<keyof A[K]>>(
        apiToPatch: A,
        groupName: K,
        methodNames: I,
    ): void => {
        const apiGroup = apiToPatch[groupName];

        for (const methodName of methodNames) {
            const apiGroupMember = apiGroup[methodName];

            if (typeof apiGroupMember !== "function") { // TODO TS enforce type-level type-safety so runtime check not needed
                throw new Error(`Rate limiting api member type should be a "function"`);
            }

            const logMethodName = `${String(groupName)}.${String(methodName)}`;
            const originalMethod = apiGroupMember.bind(apiGroup) as (...args: unknown[]) => Promise<unknown>;
            const log = (msg: string, extraProps?: NoExtraProps<{ waitTimeMs: number }>): void => {
                logger.verbose(`${msg} (method name: ${logMethodName})`, JSON.stringify({...state, ...extraProps}));
            };
            const overriddenMethod: typeof originalMethod = async (...args) => {
                log("queueing rate limited method");

                return callingQueue.q(async () => {
                    const {waitTimeMs} = await consumeMemoryRateLimiter(consumeRateLimiting);
                    const shouldWait = waitTimeMs > 0;
                    const extraLogProps = shouldWait ? {waitTimeMs} as const : undefined;

                    log("calling rate limited method", extraLogProps);

                    if (shouldWait) {
                        log("delaying rate limited method calling", extraLogProps);
                        await asyncDelay(waitTimeMs);
                    }

                    const callResult = originalMethod(...args); // should be awaited on the upper level (by consumer)

                    for (const promiseMemberName of ["then", "catch"] as const) {
                        assertTypeOf(
                            {value: callResult[promiseMemberName], expectedType: "function"},
                            `Rate limited "${logMethodName}()" call result is not a Promise`,
                        );
                    }

                    state.callsCount++;

                    return callResult;
                });
            };

            (apiGroup as Record<typeof methodName, typeof originalMethod>)[methodName] = overriddenMethod;

            logger.verbose(`attached rate limiting to method: ${logMethodName}`);
        }
    };

    attach(api, "_custom_", ["decryptMessageBody"]);
    attach(api, "label", ["get"]);
    attach(api, "conversation", ["getConversation", "queryConversations"]);
    attach(api, "message", ["getMessage", "queryMessageMetadata", "labelMessages", "markMessageAsRead"]);
    attach(api, "contact", ["queryContacts", "getContact"]);
    attach(api, "events", ["getEvents", "getLatestID"]);
    attach(api, "attachmentLoader", ["getDecryptedAttachment"]);
};
