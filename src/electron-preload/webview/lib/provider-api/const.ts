export const NEVER_FN = (): never => {
    throw new Error("Uninitialized function called");
};
