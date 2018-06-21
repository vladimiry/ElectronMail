
export const waitElements = <E extends HTMLElement, T extends { [k: string]: () => E }>(
    queries: T,
    opts: { timeoutMs: number } = {timeoutMs: 1000 * 10},
): Promise<T> => new Promise((resolve, reject) => {
    const startTime = Number(new Date());
    const keys = Object.keys(queries) as [keyof T];
    const result = {} as T;
    const iteration = () => {
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

        if (Number(new Date()) - startTime > opts.timeoutMs) {
            return reject(new Error(
                `Failed to locate some DOM elements: [${Object.keys(queries).join(", ")}] within ${opts.timeoutMs}ms`,
            ));
        }

        // TODO try window.requestAnimationFrame(testIteration)
        setTimeout(iteration, Math.max(100, opts.timeoutMs / 100));
    };

    iteration();
});
