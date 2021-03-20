export type BuildEnvironment = "production" | "development" | "test" | "e2e";

export type BuildAngularCompilationFlags = { readonly aot: boolean, readonly ivy: boolean };
