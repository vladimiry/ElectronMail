import {ChangeDetectionStrategy, Component, Input, OnDestroy} from "@angular/core";
import {EMPTY, Subject} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, mergeMap, takeUntil} from "rxjs/operators";

import {CORE_ACTIONS, DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, MAIL_FOLDER_TYPE, Mail, View} from "src/shared/model/database";
import {ElectronService} from "../_core/electron.service";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/db-view";
import {ToggleFolderMetadataPropEmitter} from "./db-view-mails.component";

@Component({
    selector: "email-securely-app-db-view-mail-tab",
    templateUrl: "./db-view-mail-tab.component.html",
    styleUrls: ["./db-view-mail-tab.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailTabComponent extends NgChangesObservableComponent implements OnDestroy {
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

    private unSubscribe$ = new Subject();

    constructor(
        private store: Store<State>,
        private api: ElectronService,
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

    export() {
        this.api.ipcMainClient({timeoutMs: ONE_SECOND_MS * 60 * 5})("dbExport")(this.dbAccountPk)
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(
                () => {},
                (error) => this.store.dispatch(CORE_ACTIONS.Fail(error)),
            );
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
