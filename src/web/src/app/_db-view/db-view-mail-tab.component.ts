import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {filter, map, mergeMap, tap} from "rxjs/operators";

import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions/db-view";
import {DbAccountPk, MAIL_FOLDER_TYPE, Mail, View} from "src/shared/model/database";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mail-tab",
    templateUrl: "./db-view-mail-tab.component.html",
    styleUrls: ["./db-view-mail-tab.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailTabComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    state$ = this.store.pipe(
        select((state) => FEATURED.accountRecord(this.dbAccountPk)(state)),
        mergeMap((instance) => instance ? [instance] : []),
        tap(({selectedFolderPk, folders}) => {
            if (selectedFolderPk) {
                return;
            }
            const inboxFolder = folders.system.find(({folderType}) => folderType === MAIL_FOLDER_TYPE.INBOX) as View.Folder;
            this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk: inboxFolder.pk}));
        }),
        filter(({selectedFolderPk}) => Boolean(selectedFolderPk)),
        map(({folders, selectedMail, selectedFolderPk, foldersMeta}) => {
            const selectedFolder = [...folders.system, ...folders.custom].find(({pk}) => pk === selectedFolderPk);

            return {
                folders,
                folderMeta: selectedFolder && selectedFolder.pk in foldersMeta ? foldersMeta[selectedFolder.pk] : undefined,
                selectedMail,
                selectedFolderPk,
                rootConversationNodes: selectedFolder ? selectedFolder.rootConversationNodes : [],
            };
        }),
    );

    constructor(
        private store: Store<State>,
    ) {}

    trackFolderByPk(index: number, {pk}: View.Folder) {
        return pk;
    }

    selectFolder({pk: folderPk}: View.Folder) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk}));
    }

    selectMailPkHandler(mailPk: Mail["pk"]) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectMailRequest({dbAccountPk: this.dbAccountPk, mailPk}));
    }

    toggleRootNodesCollapsingHandler({entryPk}: View.RootConversationNode) {
        this.store.dispatch(DB_VIEW_ACTIONS.ToggleRootNodesCollapsing({dbAccountPk: this.dbAccountPk, entryPk}));
    }
}
