import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {FolderWithMailsReference as Folder} from "src/shared/model/database";

@Component({
    selector: "email-securely-app-db-view-folder",
    templateUrl: "./db-view-folder.component.html",
    styleUrls: ["./db-view-folder.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewFolderComponent {
    state: { size: number; title: string; unread: number } = {size: 0, title: "", unread: 0};

    @Input()
    set folder({name, mails}: Folder) {
        this.state.title = name;
        this.state.size = mails.length;
        this.state.unread = mails.filter(({unread}) => unread).length;
    }
}
