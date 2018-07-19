import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";

@Component({
    selector: "email-securely-app-error-item",
    templateUrl: "./error-item.component.html",
    styleUrls: ["./error-item.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    preserveWhitespaces: true,
})
export class ErrorItemComponent {
    stackTrace: string;
    stackTraceOpened = false;

    @Input()
    error: Error;
    @Output()
    removeHandler = new EventEmitter<Error>();

    remove() {
        this.removeHandler.emit(this.error);
    }
}
