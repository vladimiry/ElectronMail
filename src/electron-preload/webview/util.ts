import {EMPTY} from "rxjs";
import {Keyboard} from "keysim";

import {ONE_SECOND_MS} from "_@shared/constants";

export const waitElements = <E extends HTMLElement, T extends { [k: string]: () => E }>(
    queries: T,
    opts: { timeoutMs?: number, attemptsLimit?: number } = {},
): Promise<T> => new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs || ONE_SECOND_MS * 10;
    const attemptsLimit = opts.attemptsLimit || 0; // 0 - unlimited
    const delayMinMs = 300;

    const startTime = Number(new Date());
    const delayMs = timeoutMs / 50;
    const keys = Object.keys(queries) as [keyof T];
    const result = {} as T;

    let attempt = 0;

    iteration();

    function iteration() {
        attempt++;

        keys.reduce((store, key) => {
            if (!(key in store)) {
                const el = queries[key]();

                if (el) {
                    store[key] = () => el;
                }
            }

            return store;
        }, result);

        if (Object.keys(result).length === keys.length) {
            return resolve(result);
        }

        if (attemptsLimit && (attempt >= attemptsLimit)) {
            return reject(new Error(
                `Failed to locate some DOM elements: [${Object.keys(queries).join(", ")}] having made ${attempt} attempts`,
            ));
        }

        if (Number(new Date()) - startTime > timeoutMs) {
            return reject(new Error(
                `Failed to locate some DOM elements: [${Object.keys(queries).join(", ")}] within ${timeoutMs}ms`,
            ));
        }

        setTimeout(iteration, Math.max(delayMinMs, delayMs));
    }
});

export function getLocationHref(): string {
    return (window as any).location.href;
}

export async function typeInputValue(input: HTMLInputElement, value: string) {
    input.value = value;
    Keyboard.US_ENGLISH.dispatchEventsForInput(value, input);
}

export async function submitTotpToken(
    input: HTMLInputElement,
    button: HTMLElement,
    tokenResolver: () => string,
    {submitTimeoutMs}: { submitTimeoutMs: number } = {submitTimeoutMs: 4000},
): Promise<never> {
    if (input.value) {
        throw new Error("2FA TOTP token is not supposed to be pre-filled on this stage");
    }

    const errorMessage = `Failed to submit two factor token within ${submitTimeoutMs}ms`;

    try {
        await submit();
    } catch (e) {
        if (e.message === errorMessage) {
            // second attempt as token might become expired right before submitting
            await new Promise((resolve) => setTimeout(resolve, submitTimeoutMs));
            await submit();
        }
        throw e;
    }

    return EMPTY.toPromise();

    async function submit() {
        const urlBeforeSubmit = getLocationHref();

        await typeInputValue(input, tokenResolver());

        button.click();

        await new Promise((resolve) => setTimeout(resolve, submitTimeoutMs));

        if (getLocationHref() === urlBeforeSubmit) {
            throw new Error(errorMessage);
        }
    }
}
