import {ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, LOCALE_ID, Output} from "@angular/core";
import {formatDate} from "@angular/common";

import {NotificationItem} from "src/web/browser-window/app/store/actions/notification";

@Component({
    selector: "electron-mail-notification-item",
    templateUrl: "./notification-item.component.html",
    styleUrls: ["./notification-item.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    preserveWhitespaces: true,
})
export class NotificationItemComponent {
    type: NotificationItem["type"] = "error";

    message: string = "";

    @Output()
    removeHandler = new EventEmitter<NotificationItem>();

    private _item!: NotificationItem;

    @Input()
    set item(value: NotificationItem) {
        this._item = value;

        this.type = value.type;

        this.message = "message" in value.data
            ? value.data.message
            : (
                value.data
                    .map(({title, url, date}) => {
                        const hint = `Published at: ${formatDate(date, "medium", this.locale)}`;
                        return url
                            ? `<a href="${url}" title="${hint}">${title}</a>`
                            : `<snap title="${hint}">${title}</snap>`;
                    })
                    .join(", ")
            );
    }

    constructor(
        @Inject(LOCALE_ID)
        private locale: string,
    ) {}

    remove() {
        this.removeHandler.emit(this._item);
    }
}
