import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {View} from "src/shared/model/database";

@Component({
    selector: "email-securely-app-db-view-folder",
    templateUrl: "./db-view-folder.component.html",
    styleUrls: ["./db-view-folder.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewFolderComponent {
    @Input()
    folder!: View.Folder;
}
