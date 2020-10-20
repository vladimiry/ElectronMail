import {buildDbPatchRetryPipeline} from "src/electron-preload/webview/lib/util";
import {isProtonApiError, sanitizeProtonApiError} from "src/electron-preload/lib/util";

export const preprocessError: Parameters<typeof buildDbPatchRetryPipeline>[0] = (() => {
    const strings = {
        statusTexts: {
            "service unavailable": "service unavailable",
            "gateway time-out": "gateway time-out",
        },
        networkConnectionErrorNames: ["aborterror", "timeouterror", "offlineerror"],
    };
    const result: typeof preprocessError = (error) => {
        const retriable = (
            !navigator.onLine
            ||
            (
                isProtonApiError(error)
                &&
                (
                    // network connection error, connection abort, offline, etc
                    [0, -1].includes(error.status)
                    ||
                    (
                        // there were periods when the requests to protonmail's API ended up
                        // with "503 / service unavailable" error quite often during the day
                        error.status === 503
                        ||
                        error.response?.statusText?.toLocaleLowerCase() === strings.statusTexts["service unavailable"]
                    )
                    ||
                    (
                        error.status === 504
                        ||
                        error.response?.statusText?.toLocaleLowerCase() === strings.statusTexts["gateway time-out"]
                    )
                    ||
                    strings.networkConnectionErrorNames.includes(error.name.toLocaleLowerCase())
                )
            )
        );
        return {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            error: sanitizeProtonApiError(error) as unknown as Error,
            retriable,
            skippable: retriable,
        };
    };
    return result;
})();
