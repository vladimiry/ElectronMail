export type BuildEnvironment = "production" | "development" | "test" | "e2e";

export type BuildAngularCompilationFlags = Readonly<{
    aot: boolean;
    ivy: boolean;
}>;
