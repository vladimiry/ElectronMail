import * as StackFrame from "stackframe";

import {ElectronTransportError} from "_shared/model/electron";

export enum StatusCode {
    NotFoundAccount = 0,
}

export class StatusCodeError extends Error {
    constructor(message: string, public statusCode: StatusCode) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class StackFramedError extends Error implements ElectronTransportError {
    public readonly stackFrames: StackTrace.StackFrame[];

    constructor({message, stackFrames}: { message: string, stackFrames: StackTrace.StackFrame[] }) {
        super(message);
        this.stackFrames = stackFrames.map((stackFrame) => new StackFrame(stackFrame));
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
