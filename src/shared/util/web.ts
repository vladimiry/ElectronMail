export const resolveDomElements = async <
    E extends Element | null,
    Q extends Readonly<Record<string, () => E>>,
    K extends keyof Q,
    R extends { [key in K]: Exclude<ReturnType<Q[key]>, null> },
>(
    query: Q,
    {timeLimitMs, scanIntervalMs, iterationsLimit = 0}: {timeLimitMs: number; scanIntervalMs: number; iterationsLimit?: number},
): Promise<R> => {
    const scanIntervalMinMs = 300;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
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

            if (iterationsLimit && (it >= iterationsLimit)) {
                return reject(
                    new Error(
                        `Failed to resolve some DOM elements from the list [${queryKeys.join(", ")}] having "${it}" iterations performed`,
                    ),
                );
            }

            if (Date.now() - startTime > timeLimitMs) {
                return reject(
                    new Error(
                        `Failed to resolve some DOM elements from the list [${queryKeys.join(", ")}] within "${timeLimitMs}" milliseconds`,
                    ),
                );
            }

            setTimeout(scanElements, Math.max(scanIntervalMinMs, scanIntervalMs));
        };

        scanElements();
    });
};

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

export const getLocationHref: () => string = () => window.location.href;
