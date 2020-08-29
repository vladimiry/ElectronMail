import {concatMap, delay, retryWhen} from "rxjs/operators";
import {from, of, throwError} from "rxjs";

import {Config} from "src/shared/model/options";
import {DbPatch} from "src/shared/api/common";
import {FsDbAccount} from "src/shared/model/database";
import {IPC_MAIN_API, IpcMainApiEndpoints} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {asyncDelay, curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

const configsCache: { resolveDomElements?: Config } = {};

export const resolveIpcMainApi: (
    logger: ReturnType<typeof buildLoggerBundle>,
) => Promise<ReturnType<typeof IPC_MAIN_API.client>> = (
    (): typeof resolveIpcMainApi => {
        let ipcMainApiClient: ReturnType<typeof IPC_MAIN_API.client> | undefined;

        const result: typeof resolveIpcMainApi = async (logger) => {
            if (ipcMainApiClient) {
                return ipcMainApiClient;
            }

            const {timeouts: {defaultApiCall: timeoutMs}} = await IPC_MAIN_API.client({options: {logger}})("readConfig")();

            ipcMainApiClient = IPC_MAIN_API.client({options: {timeoutMs, logger}});

            return ipcMainApiClient;
        };

        return result;
    }
)();

export const resolveDomElements = async <E extends Element,
    Q extends Readonly<Record<string, () => E>>,
    K extends keyof Q,
    R extends { [key in K]: ReturnType<Q[key]> }>(
    query: Q,
    logger: ReturnType<typeof buildLoggerBundle>,
    opts: { timeoutMs?: number; iterationsLimit?: number } = {},
): Promise<Readonly<R>> => {
    if (!configsCache.resolveDomElements) {
        const api = await resolveIpcMainApi(logger);
        configsCache.resolveDomElements = await api("readConfig")();
    }

    return new Promise((resolve, reject) => {
        const OPTS = {
            timeoutMs: (
                opts.timeoutMs
                ??
                configsCache.resolveDomElements?.timeouts.domElementsResolving
                ??
                ONE_SECOND_MS * 10
            ),
            iterationsLimit: opts.iterationsLimit || 0, // 0 - unlimited
            delayMinMs: 300,
        };

        const startTime = Date.now();
        const delayMs = OPTS.timeoutMs / 50;
        const queryKeys: K[] = Object.keys(query) as K[];
        const resolvedElements: Partial<R> = {};
        let it = 0;

        const scanElements: () => void = () => {
            it++;

            queryKeys.forEach((key) => {
                if (key in resolvedElements) {
                    return;
                }
                const element = query[key]();
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

function triggerChangeEvent(input: HTMLInputElement): void {
    // protonmail (angularjs)
    const changeEvent = document.createEvent("HTMLEvents");
    changeEvent.initEvent("change", true, false);
    input.dispatchEvent(changeEvent);
}

export function fillInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    triggerChangeEvent(input);
}

export async function submitTotpToken(
    input: HTMLInputElement,
    button: HTMLElement,
    resolveToken: () => Promise<string>,
    _logger: ReturnType<typeof buildLoggerBundle>,
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
    const logger = curryFunctionMembers(_logger, "submitTotpToken()");

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
    preprocessError: (
        rawError: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ) => { error: Error; retriable: boolean; skippable: boolean },
    metadata: FsDbAccount["metadata"] | null,
    logger: ReturnType<typeof buildLoggerBundle>,
    {retriesDelay = ONE_SECOND_MS * 5, retriesLimit = 3}: { retriesDelay?: number; retriesLimit?: number } = {},
) {
    const errorResult = (error: Error): ReturnType<typeof throwError> => {
        logger.error(error);
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
                    logger.warn(message, error);
                    return from(Promise.resolve());
                }
                return errorResult(error);
            }

            if (retriable) {
                logger.warn(`Retrying "buildDbPatch" call (attempt: "${retryIndex}")`);
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
    logger: ReturnType<typeof buildLoggerBundle>,
): Promise<void> {
    logger.info("persist() start");

    await (await resolveIpcMainApi(logger))("dbPatch")({
        login: data.login,
        metadata: data.metadata,
        patch: data.patch,
    });

    logger.info("persist() end");
}

export function buildEmptyDbPatch(): DbPatch {
    return {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: [], upsert: []},
        folders: {remove: [], upsert: []},
        contacts: {remove: [], upsert: []},
    };
}

export function disableBrowserNotificationFeature(parentLogger: ReturnType<typeof buildLoggerBundle>): void {
    delete (window as {Notification?: (typeof window)["Notification"]}).Notification;
    parentLogger.info(`browser "notification" feature disabled`);
}
