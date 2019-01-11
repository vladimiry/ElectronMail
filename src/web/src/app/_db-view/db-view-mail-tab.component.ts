import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, OnDestroy} from "@angular/core";
import {EMPTY, Subject} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, filter, finalize, mergeMap, takeUntil, throttleTime} from "rxjs/operators";

import {CORE_ACTIONS, DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, MAIL_FOLDER_TYPE, Mail, View} from "src/shared/model/database";
import {ElectronService} from "../_core/electron.service";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mail-tab",
    templateUrl: "./db-view-mail-tab.component.html",
    styleUrls: ["./db-view-mail-tab.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailTabComponent extends NgChangesObservableComponent implements OnDestroy {
    exporting?: boolean;

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

                    const {folders, selectedMailData, selectedFolderPk, selectedFolderMails} = instance;

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
                        selectedFolderMails: selectedFolder && selectedFolder.pk in selectedFolderMails
                            ? selectedFolderMails[selectedFolder.pk]
                            : undefined,
                        selectedMailData,
                        selectedFolderPk,
                    }];
                }),
            );
        }),
    );

    private unSubscribe$ = new Subject();

    constructor(
        private store: Store<State>,
        private api: ElectronService,
        private changeDetectorRef: ChangeDetectorRef,
    ) {
        super();
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        const element = event.target as Element | undefined;

        if (element && element.classList.contains("prevent-default-event")) {
            event.preventDefault();
        }
    }

    trackFolderByPk(index: number, {pk}: View.Folder) {
        return pk;
    }

    selectFolder({pk: folderPk}: View.Folder) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk}));
    }

    selectListMailToDisplayRequest(mailPk: Mail["pk"]) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectListMailToDisplayRequest({dbAccountPk: this.dbAccountPk, mailPk}));
    }

    selectRootNodeMailToDisplayRequest(mailPk: Mail["pk"]) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectRootNodeMailToDisplayRequest({dbAccountPk: this.dbAccountPk, mailPk}));
    }

    export() {
        this.api.ipcMainClient({timeoutMs: ONE_SECOND_MS * 60 * 5})("dbExport")(this.dbAccountPk)
            .pipe(
                takeUntil(this.unSubscribe$),
                filter((value) => "progress" in value),
                throttleTime(ONE_SECOND_MS / 2),
                finalize(() => {
                    delete this.exporting;
                    this.changeDetectorRef.detectChanges();
                }),
            )
            .subscribe(
                () => {
                    if (this.exporting) {
                        return;
                    }
                    this.exporting = true;
                    this.changeDetectorRef.detectChanges();
                },
                (error) => this.store.dispatch(CORE_ACTIONS.Fail(error)),
            );
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
