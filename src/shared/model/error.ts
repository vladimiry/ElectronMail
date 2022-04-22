import {PACKAGE_NAME} from "src/shared/const";

type Code =
    | "NotFoundAccount"
    | "InvalidArgument"
    | "NoNetworkConnection";

const statusCodesMap: Record<Code, string> = {
    NotFoundAccount: `${PACKAGE_NAME}:NotFoundAccount`,
    InvalidArgument: `${PACKAGE_NAME}:InvalidArgument`,
    NoNetworkConnection: `${PACKAGE_NAME}:NoNetworkConnection`,
};

// TODO add optional "cause" constructor argument
export class StatusCodeError extends Error {
    public static getStatusCodeValue(statusCode: keyof typeof statusCodesMap): string {
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
