export type GetHeaderCallResult = {name: string; values: string[]} | null;

export type CorsProxy = DeepReadonly<{
    headers: {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        origin: Exclude<GetHeaderCallResult, null>;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        accessControlRequestHeaders: GetHeaderCallResult;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        accessControlRequestMethod: GetHeaderCallResult;
    };
}>;
