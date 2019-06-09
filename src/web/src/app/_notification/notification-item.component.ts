import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";

import {NotificationItem} from "src/web/src/app/store/actions/notification";

@Component({
    selector: "electron-mail-notification-item",
    templateUrl: "./notification-item.component.html",
    styleUrls: ["./notification-item.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    preserveWhitespaces: true,
})
export class NotificationItemComponent {
    @Input()
    item!: NotificationItem;

    @Output()
    removeHandler = new EventEmitter<NotificationItem>();

    remove() {
        this.removeHandler.emit(this.item);
    }
}
