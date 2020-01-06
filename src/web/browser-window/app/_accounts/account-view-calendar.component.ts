import {ChangeDetectionStrategy, Component} from "@angular/core";

import {AccountViewAbstractComponent} from "src/web/browser-window/app/_accounts/account-view-abstract.component";

@Component({
    selector: "electron-mail-account-view-calendar",
    templateUrl: "./account-view-calendar.component.html",
    styleUrls: ["./account-view-calendar.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountViewCalendarComponent extends AccountViewAbstractComponent {
    constructor() {
        super("calendar");
    }
}
