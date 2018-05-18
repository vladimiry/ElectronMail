import * as StackFrame from "stackframe";
import {fromError} from "stacktrace-js";
import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output} from "@angular/core";

import {StackFramedError} from "_shared/model/error";

@Component({
    selector: `protonmail-desktop-app-error-item`,
    templateUrl: "./error-item.component.html",
    styleUrls: ["./error-item.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    preserveWhitespaces: true,
})
export class ErrorItemComponent implements OnInit {
    @Input()
    error: Error;
    @Output()
    removeHandler = new EventEmitter<Error>();
    backendStackTrace: string;
    browserStackTrace: string;
    stackTraceOpened = false;

    ngOnInit() {
        // tslint:disable-next-line:no-floating-promises
        this.initStackTrace();
    }

    remove() {
        this.removeHandler.emit(this.error);
    }

    details() {
        this.stackTraceOpened = !this.stackTraceOpened;
    }

    private async initStackTrace() {
        const browserStackFrames = (await fromError(this.error))
            .map((plainFrame) => new StackFrame(plainFrame));
        const backendStackFrames = this.error instanceof StackFramedError ? this.error.stackFrames : null;
        const toPrintabeForm = (stackFrames: StackTrace.StackFrame[]) => stackFrames.map((stackFrame) => stackFrame.toString())
            .join("\n");

        if (browserStackFrames) {
            this.browserStackTrace = toPrintabeForm(browserStackFrames);
        }

        if (backendStackFrames) {
            this.backendStackTrace = toPrintabeForm(backendStackFrames);
        }
    }
}
