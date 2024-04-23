import asap from "asap-es";
import {RateLimiterMemory} from "rate-limiter-flexible";
import UUID from "pure-uuid";

import {assertTypeOf, asyncDelay, consumeMemoryRateLimiter, curryFunctionMembers} from "src/shared/util";
import {Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/const";
import {PROVIDER_APP_NAMES} from "src/shared/const/proton-apps";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {RATE_LIMITED_METHOD_CALL_MESSAGE} from "src/electron-preload/webview/lib/const";
import {resolveCachedConfig} from "src/electron-preload/lib/util";

export const attachRateLimiting = async (api: ProviderApi, logger_: Logger): Promise<void> => {
    const logger = curryFunctionMembers(logger_, nameof(attachRateLimiting));
    const callingQueue = new asap(/* 3 TODO allow concurrent API requests */);
    const state: NoExtraProps<{callsCount: number}> = {callsCount: 0};
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
            const log = (msg: string, extraProps?: NoExtraProps<{waitTimeMs: number}>): void => {
                logger.verbose(`${msg} (method name: ${logMethodName})`, JSON.stringify({...state, ...extraProps}));
            };
            const overriddenMethod: typeof originalMethod = async (...args) => {
                log("queueing rate limited method");

                return callingQueue.q(async () => {
                    if (apiToPatch._throwErrorOnRateLimitedMethodCall) {
                        delete apiToPatch._throwErrorOnRateLimitedMethodCall;
                        throw new Error(RATE_LIMITED_METHOD_CALL_MESSAGE);
                    }
                    const {waitTimeMs} = await consumeMemoryRateLimiter(consumeRateLimiting);
                    const shouldWait = Boolean(waitTimeMs);
                    const extraLogProps = shouldWait ? {waitTimeMs} as const : undefined;

                    if (shouldWait) {
                        log("delaying rate limited method calling", extraLogProps);
                        await asyncDelay(waitTimeMs);
                    } else {
                        log("calling rate limited method", extraLogProps);
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

            (apiGroup as Record<typeof methodName, unknown>)[methodName] = overriddenMethod;

            logger.verbose(`attached rate limiting to method: ${logMethodName}`);
        }
    };

    // attach(api, "_custom_", ["decryptMessage"]);
    attach(api, "label", ["get"]);
    attach(api, "message", ["queryMessageCount", "getMessage", "queryMessageMetadata", "labelMessages", "markMessageAsRead"]);
    attach(api, "contact", ["queryContacts", "getContact"]);
    attach(api, "events", ["getEvents", "getLatestID"]);
    attach(api, "attachmentLoader", ["getDecryptedAttachment"]);
};
