import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS, View} from "src/shared/model/database";

@Component({
    selector: "electron-mail-db-view-folder",
    templateUrl: "./db-view-folder.component.html",
    styleUrls: ["./db-view-folder.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewFolderComponent {
    @Input({required: true})
    folder!: View.Folder;

    get isCustom(): boolean {
        return !SYSTEM_FOLDER_IDENTIFIERS._.isValidValue(this.folder.id);
    }

    get isFolder(): boolean {
        return this.folder.type === LABEL_TYPE.MESSAGE_FOLDER;
    }
}
