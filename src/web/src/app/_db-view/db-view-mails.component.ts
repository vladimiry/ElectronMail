import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnChanges, Output} from "@angular/core";

import {DbViewEntryComponentState} from "./db-view-entry.component";
import {FolderWithMailsReference, MailWithFolderReference} from "src/shared/model/database";

type Folder = FolderWithMailsReference;
type Mail = MailWithFolderReference;

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent implements OnChanges {
    state: { folders: Folder[]; mails: Mail[] } = {folders: [], mails: []};

    @Input()
    input!: Pick<DbViewEntryComponentState, "folders" | "filters">;

    @Output()
    private folderSelectionHandler = new EventEmitter<Folder>();

    ngOnChanges() {
        const {folders, filters} = this.input;

        this.state.mails = folders
            .filter(({pk}) => filters.selectedFoldersMap.has(pk))
            .reduce((mailsAccumulator: typeof mails, {mails}) => mailsAccumulator.concat(mails), []);
        this.state.mails.sort((o1, o2) => {
            return o2.date - o1.date;
        });

        this.state.folders = folders;
    }

    trackByEntityByPk(index: number, entity: Folder | Mail) {
        return entity.pk;
    }

    selectFolder(folder: Folder) {
        // TODO enable multiple items selection
        this.folderSelectionHandler.emit(folder);
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        if (!event.srcElement || !event.srcElement.classList.contains("sender")) {
            return;
        }
        event.preventDefault();
    }
}
