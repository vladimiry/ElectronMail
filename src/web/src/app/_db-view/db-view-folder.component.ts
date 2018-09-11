import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

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

    @Input()
    set folder({name, rootConversationNodes, folderType}: View.Folder) {
        const {size, unread} = rootConversationNodes.reduce((accumulator: { size: number; unread: number }, {summary}) => {
            accumulator.size += summary.size;
            accumulator.unread += summary.unread;
            return accumulator;
        }, {size: 0, unread: 0});
        this.state = {
            folderType,
            title: name,
            size,
            unread,
        };
    }
}
