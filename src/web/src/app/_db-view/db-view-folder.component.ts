import {ChangeDetectionStrategy, Component, Input, OnChanges} from "@angular/core";

import {FolderWithMailsReference as Folder, MAIL_FOLDER_TYPE} from "src/shared/model/database";

const mapping: Record<keyof typeof MAIL_FOLDER_TYPE._.map, { title: (f: Folder) => string }> = {
    CUSTOM: {
        title: ({name}) => name,
    },
    INBOX: {
        title: () => "Inbox",
    },
    SENT: {
        title: () => "Sent",
    },
    TRASH: {
        title: () => "Trash",
    },
    ARCHIVE: {
        title: () => "Archive",
    },
    SPAM: {
        title: () => "Spam",
    },
    DRAFT: {
        title: () => "Draft",
    },
};

@Component({
    selector: "email-securely-app-db-view-folder",
    templateUrl: "./db-view-folder.component.html",
    styleUrls: ["./db-view-folder.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewFolderComponent implements OnChanges {
    state: { size: number; title: string; unread: number } = {size: 0, title: "", unread: 0};

    @Input()
    folder!: Folder;

    ngOnChanges() {
        this.state.title = mapping[MAIL_FOLDER_TYPE._.name(this.folder.folderType)].title(this.folder);
        this.state.size = this.folder.mails.length;
        this.state.unread = this.folder.mails.filter(({unread}) => unread).length;
    }
}
