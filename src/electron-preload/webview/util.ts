import {concatMap, delay, retryWhen} from "rxjs/operators";
import {of, throwError} from "rxjs";

import {Arguments} from "src/shared/types";
import {DbPatch} from "src/shared/api/common";
import {Endpoints, IPC_MAIN_API} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {StatusCodeError} from "src/shared/model/error";
import {asyncDelay, curryFunctionMembers} from "src/shared/util";
import {buildLoggerBundle} from "src/electron-preload/util";

const ipcMainApiClient = IPC_MAIN_API.buildClient();
const ipcMainApiClientMethods = Object.freeze({
    dbPatch: ipcMainApiClient("dbPatch"),
    readConfig: ipcMainApiClient("readConfig"),
});

export const resolveDomElements = <E extends Element,
    Q extends Readonly<Record<string, () => E>>,
    K extends keyof Q,
    R extends { [key in K]: ReturnType<Q[key]> }>(
    query: Q,
    opts: { timeoutMs?: number, iterationsLimit?: number } = {},
): Promise<Readonly<R>> => new Promise(async (resolve, reject) => {
    let configTimeout: number | undefined;

    try {
        const config = await ipcMainApiClientMethods.readConfig().toPromise();
        configTimeout = config.timeouts.domElementsResolving;
    } catch (error) {
        return reject(error);
    }

    const OPTS = {
        timeoutMs: opts.timeoutMs || configTimeout || ONE_SECOND_MS * 10,
        iterationsLimit: opts.iterationsLimit || 0, // 0 - unlimited
        delayMinMs: 300,
    };

    const startTime = Number(new Date());
    const delayMs = OPTS.timeoutMs / 50;
    const queryKeys: K[] = Object.keys(query) as K[];
    const resolvedElements: Partial<R> = {};
    let iteration = 0;

    scanElements();

    function scanElements() {
        iteration++;

        queryKeys.forEach((key) => {
            if (key in resolvedElements) {
                return;
            }
            const element = query[key]();
            if (element) {
                resolvedElements[key] = element as any;
            }
        });

        if (Object.keys(resolvedElements).length === queryKeys.length) {
            return resolve(resolvedElements as R);
        }

        if (OPTS.iterationsLimit && (iteration >= OPTS.iterationsLimit)) {
            return reject(new Error(
                `Failed to resolve some DOM elements from the list [${queryKeys.join(", ")}] having "${iteration}" iterations performed`,
            ));
        }

        if (Number(new Date()) - startTime > OPTS.timeoutMs) {
            return reject(new Error(
                `Failed to resolve some DOM elements from the list [${queryKeys.join(", ")}] within "${OPTS.timeoutMs}" milliseconds`,
            ));
        }

        setTimeout(scanElements, Math.max(OPTS.delayMinMs, delayMs));
    }
});

export function getLocationHref(): string {
    return (window as any).location.href;
}

export async function fillInputValue(input: HTMLInputElement, value: string) {
    input.value = value;
    triggerChangeEvent(input);
}

export async function submitTotpToken(
    input: HTMLInputElement,
    button: HTMLElement,
    tokenResolver: () => string,
    _logger: ReturnType<typeof buildLoggerBundle>,
): Promise<null> {
    const logger = curryFunctionMembers(_logger, "submitTotpToken()");
    logger.info();

    const submitTimeoutMs = ONE_SECOND_MS * 4;
    const newTokenDelayMs = ONE_SECOND_MS * 2;

    if (input.value) {
        throw new Error("2FA TOTP token is not supposed to be pre-filled on this stage");
    }

    const errorMessage = `Failed to submit two factor token within ${submitTimeoutMs}ms`;

    try {
        await submit();
    } catch (e) {
        if (e.message !== errorMessage) {
            throw e;
        }

        logger.verbose(`submit 1 - fail: ${e.message}`);
        // second attempt as token might become expired right before submitting
        await asyncDelay(newTokenDelayMs, submit);
    }

    return null;

    async function submit() {
        logger.verbose("submit - start");
        const urlBeforeSubmit = getLocationHref();

        await fillInputValue(input, tokenResolver());
        logger.verbose("input filled");

        button.click();
        logger.verbose("clicked");

        await asyncDelay(submitTimeoutMs);

        if (getLocationHref() === urlBeforeSubmit) {
            throw new Error(errorMessage);
        }

        logger.verbose("submit - success");
    }
}

export function buildDbPatchRetryPipeline<T>(
    preprocessError: (rawError: any) => { error: any; retriable: boolean; skippable: boolean; },
    logger: ReturnType<typeof buildLoggerBundle>,
    {retriesDelay = ONE_SECOND_MS * 5, retriesLimit = 3}: { retriesDelay?: number, retriesLimit?: number } = {},
) {
    return retryWhen<T>((errors) => errors.pipe(
        concatMap((rawError, index) => {
            const {error, retriable, skippable} = preprocessError(rawError);

            if (index >= retriesLimit) {
                if (skippable) {
                    const message = `Skipping "buildDbPatch" call`;
                    logger.error(message, JSON.stringify(error));
                    return throwError(new StatusCodeError(message, "SkipDbPatch"));
                }
                return throwError(error);
            }

            if (retriable) {
                logger.error(`Retrying "buildDbPatch" call (attempt: "${index}")`, JSON.stringify(error));
                return of(error).pipe(
                    delay(retriesDelay),
                );
            }

            return throwError(error);
        }),
    ));
}

function triggerChangeEvent(input: HTMLInputElement) {
    // protonmail (angularjs)
    const changeEvent = document.createEvent("HTMLEvents");
    changeEvent.initEvent("change", true, false);
    input.dispatchEvent(changeEvent);
    // tutanota (mithril)
    const inputEvent = document.createEvent("Event");
    inputEvent.initEvent("input", true, false);
    input.dispatchEvent(inputEvent);
}

export async function persistDatabasePatch(
    data: Arguments<Endpoints["dbPatch"]>[0],
    logger: ReturnType<typeof buildLoggerBundle>,
): Promise<null> {
    logger.info("persist() start");

    await ipcMainApiClientMethods.dbPatch({
        type: data.type,
        login: data.login,
        metadata: data.metadata,
        patch: data.patch,
    }).toPromise();

    logger.info("persist() end");

    return null;
}

export function buildEmptyDbPatch(): DbPatch {
    return {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: [], upsert: []},
        folders: {remove: [], upsert: []},
        contacts: {remove: [], upsert: []},
    };
}
