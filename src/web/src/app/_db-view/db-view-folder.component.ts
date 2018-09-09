import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {FolderWithMailsReference as Folder} from "src/shared/model/database";

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

    @Input()
    set folder({name, mails, folderType}: Folder) {
        this.state = {
            title: name,
            size: mails.length,
            unread: mails.filter(({unread}) => unread).length,
            folderType,
        };
    }
}
