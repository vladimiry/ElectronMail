import {APP_NAME} from "src/shared/constants";

const statusCodesMap: Record<"NotFoundAccount" | "InvalidArgument" | "NoNetworkConnection" | "SkipDbPatch", string> = {
    NotFoundAccount: `${APP_NAME}:NotFoundAccount`,
    InvalidArgument: `${APP_NAME}:InvalidArgument`,
    NoNetworkConnection: `${APP_NAME}:NoNetworkConnection`,
    SkipDbPatch: `${APP_NAME}:SkipDbPatch`,
};

// TODO add optional "cause" constructor argument
export class StatusCodeError extends Error {
    public static getStatusCodeValue(statusCode: keyof typeof statusCodesMap) {
        return statusCodesMap[statusCode];
    }

    public static hasStatusCodeValue(error: Error | StatusCodeError, statusCode: keyof typeof statusCodesMap): error is StatusCodeError {
        return ("statusCode" in error) && error.statusCode === statusCodesMap[statusCode];
    }

    public readonly statusCode: string;

    constructor(message: string, statusCode: keyof typeof statusCodesMap) {
        super(message);
        this.statusCode = StatusCodeError.getStatusCodeValue(statusCode);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
