export type BuildEnvironment = "production" | "development" | "test";

export type BuildAngularCompilationFlags = Readonly<{
    aot: boolean;
    ivy: boolean;
}>;
