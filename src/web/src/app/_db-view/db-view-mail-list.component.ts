import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {DbViewUtil} from "./util";
import {View} from "src/shared/model/database";

@Component({
    selector: "email-securely-app-db-view-mails-list",
    templateUrl: "./db-view-mail-list.component.html",
    styleUrls: ["./db-view-mail-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsListComponent {
    @Input()
    rootConversationNodes!: View.RootConversationNode[];

    trackByEntityPk = DbViewUtil.trackByEntityPk;
}
