import {buildDbPatchRetryPipeline, isErrorOnRateLimitedMethodCall} from "src/electron-preload/webview/lib/util";
import {isProtonApiError, sanitizeProtonApiError} from "src/electron-preload/lib/util";

export const isIgnorable404Error: (error: unknown) => boolean = (() => {
    const errorCodes: ReadonlyArray<number | undefined> = [2501, 15052];
    return (error: unknown): boolean => {
        if (!isProtonApiError(error) || error.status !== 422) return false;
        return errorCodes.includes(error.data?.Code) || errorCodes.includes(error.dataCode);
    };
})();

type preprocessErrorType = Parameters<typeof buildDbPatchRetryPipeline>[0];

export const preprocessError: preprocessErrorType = (() => {
    const strings = {
        statusTextLowerCase: {
            "service unavailable": "service unavailable",
            "gateway time-out": "gateway time-out",
            "internal server error": "internal server error",
        },
        networkConnectionErrorNames: ["aborterror", "timeouterror", "offlineerror"] as readonly string[],
    } as const;
    const result: preprocessErrorType = (error) => {
        const onRateLimitedMethodCall = isErrorOnRateLimitedMethodCall(error);
        const retriable = !onRateLimitedMethodCall
                && !navigator.onLine
            || (isProtonApiError(error)
                && (
                    // network connection error, connection abort, offline, etc
                    [0, -1].includes(error.status)
                    || (error.status === 500
                        && error.response?.statusText?.toLocaleLowerCase() === strings.statusTextLowerCase["internal server error"])
                    || (
                        // there were periods when the requests to protonmail's API ended up
                        // with "503 / service unavailable" error quite often during the day
                        error.status === 503
                        || error.response?.statusText?.toLocaleLowerCase() === strings.statusTextLowerCase["service unavailable"]
                    )
                    || (error.status === 504
                        || error.response?.statusText?.toLocaleLowerCase() === strings.statusTextLowerCase["gateway time-out"])
                    || strings.networkConnectionErrorNames.includes(error.name.toLocaleLowerCase())
                ));
        return {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            error: sanitizeProtonApiError(error) as unknown as Error,
            retriable,
            skippable: onRateLimitedMethodCall || retriable,
        };
    };
    return result;
})();
