declare const APP_CONSTANTS: {
    appName: string,
    isDevEnv: boolean,
};

declare module "*.html" {
    const _: string;
    export default _;
}

declare module "*.scss" {
    const _: string;
    export default _;
}
