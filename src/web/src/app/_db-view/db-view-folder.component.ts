import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {DbViewService} from "./db-view.service";
import {View} from "src/shared/model/database";

@Component({
    selector: "email-securely-app-db-view-folder",
    templateUrl: "./db-view-folder.component.html",
    styleUrls: ["./db-view-folder.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewFolderComponent {
    state: {
        size?: number;
        title?: string;
        unread?: number;
        folderType?: string;
    } = {};

    constructor(
        private dbVieService: DbViewService,
    ) {}

    @Input()
    set folder(folder: View.Folder) {
        this.state = {
            folderType: folder.folderType,
            title: folder.name,
            ...this.dbVieService.calculateFolderSummary(folder),
        };
    }
}
