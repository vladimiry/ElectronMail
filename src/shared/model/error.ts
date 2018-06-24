export enum StatusCode {
    NotFoundAccount = 0,
}

export class StatusCodeError extends Error {
    constructor(message: string, public statusCode: StatusCode) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
