export interface BuildEnvVars {
    BUILD_ENVIRONMENT: "production" | "development" | "test" | "e2e";
    BUILD_DISABLE_START_HIDDEN_FEATURE: unknown;
    BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE: unknown;
    BUILD_START_MAXIMIZED_BY_DEFAULT: unknown;
}

export type BuildAngularCompilationFlags = {readonly aot: boolean; readonly ivy: true};
