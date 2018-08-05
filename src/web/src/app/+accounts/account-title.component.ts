import {Component, Input} from "@angular/core";

import {WebAccount} from "src/web/src/app/model";

@Component({
    selector: "email-securely-app-account-title",
    templateUrl: "./account-title.component.html",
    styleUrls: ["./account-title.component.scss"],
    preserveWhitespaces: true,
})
export class AccountTitleComponent {
    @Input()
    account!: WebAccount;
}
