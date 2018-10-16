import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output} from "@angular/core";
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
export class DbViewMailTabComponent implements OnInit {
    @Input()
    dbAccountPk!: DbAccountPk;
    @Output()
    initializedHandler = new EventEmitter<void>();

    state$!: ReturnType<typeof DbViewMailTabComponent.prototype.buildState$>;

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit() {
        this.state$ = this.buildState$();
        this.initializedHandler.emit();
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

    toggleRootNodesCollapsingHandler({entryPk}: View.RootConversationNode) {
        this.store.dispatch(DB_VIEW_ACTIONS.ToggleRootNodesCollapsing({dbAccountPk: this.dbAccountPk, entryPk}));
    }

    private buildState$() {
        return this.store.pipe(
            select(FEATURED.accountRecord, {pk: this.dbAccountPk}),
            tap(() => FEATURED.accountRecord.release()),
            mergeMap((instance) => instance ? [instance] : []),
            tap(({folders, selectedMail, selectedFolderPk, foldersMeta}) => {
                if (selectedFolderPk) {
                    return;
                }
                const inbox = folders.system.find((f) => f.folderType === MAIL_FOLDER_TYPE.INBOX);
                if (!inbox) {
                    throw new Error(`Failed to resolve "inbox" folder`);
                }
                this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk: inbox.pk}));
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
    }
}
