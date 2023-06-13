export interface ProtonApiError {
    config?: unknown
    data?: {
        Error?: unknown,
        ErrorDescription?: unknown,
    } & Partial<Pick<import("src/electron-preload/webview/lib/rest-model/response").Response, "Code">>
    message: string
    name: string;
    response?: Partial<Response>
    status: number
}
