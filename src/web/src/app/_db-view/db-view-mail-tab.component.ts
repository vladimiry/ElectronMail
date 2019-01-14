import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, HostListener, OnDestroy} from "@angular/core";
import {EMPTY, Subject} from "rxjs";
import {Store, select} from "@ngrx/store";
import {filter, finalize, map, mergeMap, takeUntil, throttleTime} from "rxjs/operators";

import {CORE_ACTIONS, DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbViewAbstractComponent} from "src/web/src/app/_db-view/db-view-abstract.component";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {MAIL_FOLDER_TYPE, View} from "src/shared/model/database";
import {MailsBundleKey, State} from "src/web/src/app/store/reducers/db-view";
import {ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/src/app/store/selectors";

@Component({
    selector: "email-securely-app-db-view-mail-tab",
    templateUrl: "./db-view-mail-tab.component.html",
    styleUrls: ["./db-view-mail-tab.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailTabComponent extends DbViewAbstractComponent implements OnDestroy {
    exporting?: boolean;

    mailsBundleKey: Extract<MailsBundleKey, "folderMailsBundle" | "folderConversationsBundle"> = "folderConversationsBundle";

    @HostBinding("class.search-view")
    searchView: boolean = false;

    searchViewEnabled$ = this.store.pipe(
        select(OptionsSelectors.CONFIG.base),
        map((baseConfig) => {
            if (!baseConfig.fullTextSearch) {
                this.searchView = false;
            }
            return baseConfig.fullTextSearch;
        }),
    );

    state$ = this.instance$.pipe(
        mergeMap((instance) => {
            const {folders, selectedFolderPk, selectedMail} = instance;

            if (!selectedFolderPk) {
                const inbox = folders.system.find((f) => f.folderType === MAIL_FOLDER_TYPE.INBOX);

                if (!inbox) {
                    throw new Error(`Failed to resolve "inbox" folder`);
                }

                this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk: inbox.pk}));

                return EMPTY;
            }

            return [{
                folders,
                selectedMail,
                selectedFolderPk,
            }];
        }),
    );

    private unSubscribe$ = new Subject();

    constructor(
        store: Store<State>,
        private api: ElectronService,
        private changeDetectorRef: ChangeDetectorRef,
    ) {
        super(store);
    }

    toggleSearchView() {
        this.searchView = !this.searchView;

        if (this.searchView) {
            this.store.dispatch(DB_VIEW_ACTIONS.SelectMail({dbAccountPk: this.dbAccountPk}));
            this.store.dispatch(DB_VIEW_ACTIONS.ResetSearchMailsBundleItems({dbAccountPk: this.dbAccountPk}));
        }
    }

    toggleMailsBundleKey() {
        this.mailsBundleKey = this.mailsBundleKey === "folderConversationsBundle"
            ? "folderMailsBundle"
            : "folderConversationsBundle";
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        const element = event.target as Element | undefined;

        if (element && element.classList.contains("prevent-default-event")) {
            event.preventDefault();
        }
    }

    trackFolder(index: number, {pk}: View.Folder) {
        return pk;
    }

    selectFolder({pk: folderPk}: View.Folder) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, folderPk}));
    }

    // TODO move export to separate component
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
        super.ngOnDestroy();
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
