import WebStorageCookieStore from "tough-cookie-web-storage-store";
import {CookieJar} from "tough-cookie";
import {Observable, ReplaySubject, from, of, throwError} from "rxjs";
import {concatMap, delay, retryWhen} from "rxjs/operators";

import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {DbPatch} from "src/shared/api/common";
import {FsDbAccount} from "src/shared/model/database";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/constants";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {asyncDelay, curryFunctionMembers, isDatabaseBootstrapped, resolveApiUrlByPackagedWebClientUrlSafe} from "src/shared/util";
import {resolveCachedConfig, resolveIpcMainApi} from "src/electron-preload/lib/util";

export const resolveDomElements = async <E extends Element | null,
    Q extends Readonly<Record<string, () => E>>,
    K extends keyof Q,
    R extends { [key in K]: Exclude<ReturnType<Q[key]>, null> }>(
    query: Q,
    logger: Logger,
    opts: { timeoutMs?: number; iterationsLimit?: number } = {},
): Promise<R> => {
    const {timeouts: {domElementsResolving}} = await resolveCachedConfig(logger);

    return new Promise((resolve, reject) => {
        const OPTS = {
            timeoutMs: (
                opts.timeoutMs
                ??
                domElementsResolving
                ??
                ONE_SECOND_MS * 10
            ),
            iterationsLimit: opts.iterationsLimit || 0, // 0 - unlimited
            delayMinMs: 300,
        };

        const startTime = Date.now();
        const delayMs = OPTS.timeoutMs / 50;
        const queryKeys = Object.keys(query) as K[];
        const resolvedElements: Partial<R> = {};
        let it = 0;

        const scanElements: () => void = () => {
            it++;

            queryKeys.forEach((key) => {
                if (key in resolvedElements) {
                    return;
                }
                const queryFn = query[key];
                if (typeof queryFn !== "function") {
                    throw new Error("Failed to resolved query function");
                }
                const element = queryFn();
                if (element) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any,  @typescript-eslint/no-unsafe-assignment
                    resolvedElements[key] = element as any;
                }
            });

            if (Object.keys(resolvedElements).length === queryKeys.length) {
                return resolve(resolvedElements as R);
            }

            if (OPTS.iterationsLimit && (it >= OPTS.iterationsLimit)) {
                return reject(
                    new Error(
                        `Failed to resolve some DOM elements from the list [${queryKeys.join(", ")}] having "${it}" iterations performed`,
                    ),
                );
            }

            if (Date.now() - startTime > OPTS.timeoutMs) {
                return reject(new Error(
                    `Failed to resolve some DOM elements from the list [${queryKeys.join(", ")}] within "${OPTS.timeoutMs}" milliseconds`,
                ));
            }

            setTimeout(scanElements, Math.max(OPTS.delayMinMs, delayMs));
        };

        scanElements();
    });
};

export function getLocationHref(): string {
    return window.location.href;
}

export function fillInputValue(input: HTMLInputElement, value: string): void {
    const setValue = (() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const valueSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;

        return prototypeValueSetter && valueSetter !== prototypeValueSetter
            ? prototypeValueSetter
            : valueSetter;
    })();

    if (!setValue) {
        throw new Error("Form input control value setter resolving failed");
    }

    setValue.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
}

export async function submitTotpToken(
    input: HTMLInputElement,
    button: HTMLElement,
    resolveToken: () => Promise<string>,
    _logger: Logger,
    {
        submitTimeoutMs = ONE_SECOND_MS * 8,
        newTokenDelayMs = ONE_SECOND_MS * 2,
        submittingDetection,
    }: {
        submitTimeoutMs?: number;
        newTokenDelayMs?: number;
        submittingDetection?: () => Promise<boolean>;
    } = {},
): Promise<void> {
    const logger = curryFunctionMembers(_logger, nameof(submitTotpToken));

    logger.info();

    if (input.value) {
        throw new Error("2FA TOTP token is not supposed to be pre-filled on this stage");
    }

    const errorMessage = `Failed to submit two factor token within ${submitTimeoutMs}ms`;

    const submit: () => Promise<void> = async () => {
        logger.verbose("submit - start");

        const submitted: () => Promise<boolean> = (
            submittingDetection
            ||
            ((urlBeforeSubmit = getLocationHref()) => {
                return async () => getLocationHref() !== urlBeforeSubmit;
            })()
        );

        fillInputValue(input, await resolveToken());
        logger.verbose("input filled");

        button.click();
        logger.verbose("clicked");

        await asyncDelay(submitTimeoutMs);

        // TODO consider using unified submitting detection
        //      like for example testing that input/button elements no longer attached to DOM or visible
        if (
            !(await submitted())
        ) {
            throw new Error(errorMessage);
        }

        logger.verbose("submit - success");
    };

    try {
        await submit();
    } catch (e) {
        const {message} = e; // eslint-disable-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment

        if (message !== errorMessage) {
            throw e;
        }

        logger.verbose(`submit 1 - fail: ${String(message)}`);
        // second attempt as token might become expired right before submitting
        await asyncDelay(newTokenDelayMs, submit);
    }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function buildDbPatchRetryPipeline<T>(
    preprocessError: (rawError: unknown) => { error: Error; retriable: boolean; skippable: boolean },
    metadata: DeepReadonly<FsDbAccount["metadata"]> | null,
    logger: Logger,
    {retriesDelay = ONE_SECOND_MS * 5, retriesLimit = 3}: { retriesDelay?: number; retriesLimit?: number } = {},
) {
    const errorResult = (error: Error): ReturnType<typeof throwError> => {
        logger.error(nameof(buildDbPatchRetryPipeline), error);
        return throwError(error);
    };

    return retryWhen<T>((errors) => errors.pipe(
        concatMap((rawError, retryIndex) => {
            const {error, retriable, skippable} = preprocessError(rawError);

            if (!isDatabaseBootstrapped(metadata)) {
                // no retrying for initial/bootstrap fetch
                return errorResult(error);
            }

            if (retryIndex >= retriesLimit) {
                if (skippable) {
                    const message = `Skipping "buildDbPatch" call`;
                    logger.warn(nameof(buildDbPatchRetryPipeline), message, error);
                    return from(Promise.resolve());
                }
                return errorResult(error);
            }

            if (retriable) {
                logger.warn(nameof(buildDbPatchRetryPipeline), `Retrying call (attempt: "${retryIndex}")`);
                return of(error).pipe(
                    delay(retriesDelay),
                );
            }

            return errorResult(error);
        }),
    ));
}

export async function persistDatabasePatch(
    data: Parameters<IpcMainApiEndpoints["dbPatch"]>[0],
    logger: Logger,
    bootstrapPhase?: "initial" | "intermediate" | "final",
): Promise<void> {
    logger.info(`${nameof(persistDatabasePatch)}() start`, JSON.stringify({bootstrapPhase}));
    await resolveIpcMainApi({logger})("dbPatch")({
        bootstrapPhase,
        login: data.login,
        metadata: data.metadata,
        patch: data.patch,
    });
    logger.info(`${nameof(persistDatabasePatch)}() end`);
}

export function buildEmptyDbPatch(): DbPatch {
    return {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: [], upsert: []},
        folders: {remove: [], upsert: []},
        contacts: {remove: [], upsert: []},
    };
}

export function disableBrowserNotificationFeature(parentLogger: Logger): void {
    delete (window as Partial<Pick<typeof window, "Notification">>).Notification;
    parentLogger.info(`browser "notification" feature disabled`);
}

export const fetchEvents = async (
    providerApi: ProviderApi,
    latestEventId: RestModel.Event["EventID"],
    _logger: Logger,
): Promise<{ latestEventId: RestModel.Event["EventID"]; events: RestModel.Event[] } | "refresh"> => {
    const logger = curryFunctionMembers(_logger, nameof(fetchEvents));
    const events: RestModel.Event[] = [];
    const iterationState: NoExtraProps<{
        latestEventId: RestModel.Event["EventID"];
        sameNextIdCounter: number;
    }> = {
        latestEventId,
        sameNextIdCounter: 0,
    };

    do {
        const response = await providerApi.events.getEvents(iterationState.latestEventId);
        const hasMoreEvents = response.More === 1;

        if (response.Refresh) {
            // any non-zero value treated as "refresh needed" signal
            return "refresh";
        }

        events.push(response);

        // WARN increase "sameNextIdCounter" before "state.latestEventId" reassigning
        iterationState.sameNextIdCounter += Number(iterationState.latestEventId === response.EventID);
        iterationState.latestEventId = response.EventID;

        if (!hasMoreEvents) {
            break;
        }

        // in early july 2020 protonmail's "/events/{id}" API/backend started returning
        // old/requested "response.EventID" having no more events in the queue ("response.More" !== 1)
        // which looks like an implementation error
        // so let's allow up to 3 such problematic iterations, log the error, and break the iteration then
        // rather than raising the error like we did before in order to detect the protonmail's error
        // it's ok to break the iteration since we start from "latestEventId" next time syncing process gets triggered
        // another error handling approach is to iterate until "response.More" !== 1 but let's prefer "early break" for now
        if (iterationState.sameNextIdCounter > 2) {
            logger.error(
                `Events API indicates that there is a next event in the queue but responded with the same "next event id".`,
            );
            break;
        }
    } while (true); // eslint-disable-line no-constant-condition

    logger.info(`fetched ${events.length} missed events`);

    return {
        latestEventId: iterationState.latestEventId,
        events,
    };
};

// TODO electron: drop custom "document.cookies" logic required for pages loaded via custom scheme/protocol
//      https://github.com/electron/electron/issues/27981
//      https://github.com/ProtonMail/react-components/commit/0558e441583029f644d1a17b68743436a29d5db2#commitcomment-52005249
export const documentCookiesForCustomScheme: {
    readonly enable: (logger: Logger) => void
    readonly setNotification$: Observable<{ url: string, cookieString: string }>
} = (() => {
    // we don't need all the values but just to be able to send a signal, so "buffer = 1" should be enough
    const setNotificationSubject$ = new ReplaySubject<{ url: string, cookieString: string }>(1);
    const result: typeof documentCookiesForCustomScheme = {
        setNotification$: setNotificationSubject$.asObservable(),
        enable(logger) {
            logger.verbose(nameof(documentCookiesForCustomScheme), nameof(result.enable));

            const {document, location} = window;
            const getUrl = (): string => resolveApiUrlByPackagedWebClientUrlSafe(location.toString());
            const cookieJar = new CookieJar(
                new WebStorageCookieStore(window.sessionStorage),
            );

            Object.defineProperty(document, "cookie", {
                enumerable: true,
                configurable: true,
                get(): typeof document.cookie {
                    const url = getUrl();
                    const cookies = cookieJar.getCookiesSync(url);
                    return cookies
                        .map((cookie) => cookie.cookieString())
                        .join("; ");
                },
                set(cookieString: typeof document.cookie) {
                    const url = getUrl();
                    cookieJar.setCookieSync(cookieString, url);
                    setNotificationSubject$.next({url, cookieString});
                },
            });
        },
    };
    return result;
})();
