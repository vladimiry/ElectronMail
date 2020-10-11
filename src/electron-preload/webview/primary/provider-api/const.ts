export const NEVER_FN = (): never => {
    throw new Error("Uninitialized function called");
};

export const FETCH_NOTIFICATION_SKIP_SYMBOL = Symbol("FETCH_NOTIFICATION_SKIP_SYMBOL");
