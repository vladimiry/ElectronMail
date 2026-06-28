export type GetHeaderCallResult = {name: string; values: string[]} | null;

export type CorsProxy = DeepReadonly<{
    headers: {
        origin: Exclude<GetHeaderCallResult, null>;
        accessControlRequestHeaders: GetHeaderCallResult;
        accessControlRequestMethod: GetHeaderCallResult;
    };
}>;
