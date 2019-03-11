import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";

@Component({
    selector: "electron-mail-error-item",
    templateUrl: "./error-item.component.html",
    styleUrls: ["./error-item.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    preserveWhitespaces: true,
})
export class ErrorItemComponent {
    @Input()
    error!: Error;

    @Output()
    removeHandler = new EventEmitter<Error>();

    remove() {
        this.removeHandler.emit(this.error);
    }
}
