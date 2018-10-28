import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {EMPTY} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, mergeMap} from "rxjs/operators";

import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions/db-view";
import {DbAccountPk, MAIL_FOLDER_TYPE, Mail, View} from "src/shared/model/database";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {State} from "src/web/src/app/store/reducers/db-view";
import {ToggleFolderMetadataPropEmitter} from "./db-view-mails.component";

@Component({
    selector: "email-securely-app-db-view-mail-tab",
    templateUrl: "./db-view-mail-tab.component.html",
    styleUrls: ["./db-view-mail-tab.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailTabComponent extends NgChangesObservableComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    state$ = this.ngChangesObservable("dbAccountPk").pipe(
        mergeMap((pk) => {
            if (!pk) {
                return EMPTY;
            }

            return this.store.pipe(
                select(FEATURED.accountRecord(), {pk}),
                concatMap((instance) => {
                    if (!instance) {
                        return EMPTY;
                    }

                    const {folders, selectedMail, selectedFolderPk, foldersMeta} = instance;

                    if (!selectedFolderPk) {
                        const inbox = folders.system.find((f) => f.folderType === MAIL_FOLDER_TYPE.INBOX);
                        if (!inbox) {
                            throw new Error(`Failed to resolve "inbox" folder`);
                        }
                        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk: inbox.pk}));
                        return EMPTY;
                    }

                    const selectedFolder = [...folders.system, ...folders.custom].find((f) => f.pk === selectedFolderPk);

                    return [{
                        folders,
                        folderMeta: selectedFolder && selectedFolder.pk in foldersMeta ? foldersMeta[selectedFolder.pk] : undefined,
                        selectedMail,
                        selectedFolderPk,
                        rootConversationNodes: selectedFolder ? selectedFolder.rootConversationNodes : [],
                    }];
                }),
            );
        }),
    );

    constructor(
        private store: Store<State>,
    ) {
        super();
    }

    trackFolderByPk(index: number, {pk}: View.Folder) {
        return pk;
    }

    selectFolder({pk: folderPk}: View.Folder) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk}));
    }

    selectMailPkHandler(mailPk: Mail["pk"]) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectMailRequest({dbAccountPk: this.dbAccountPk, mailPk}));
    }

    toggleFolderMetadataPropHandler({entryPk, prop}: ToggleFolderMetadataPropEmitter) {
        this.store.dispatch(DB_VIEW_ACTIONS.ToggleFolderMetadataProp({dbAccountPk: this.dbAccountPk, prop, entryPk}));
    }
}
