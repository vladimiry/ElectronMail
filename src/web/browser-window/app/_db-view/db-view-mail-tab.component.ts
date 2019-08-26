import {ChangeDetectionStrategy, Component, HostBinding, HostListener} from "@angular/core";
import {EMPTY, Observable, of} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map, mergeMap} from "rxjs/operators";

import {DB_VIEW_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {MAIL_FOLDER_TYPE, View} from "src/shared/model/database";
import {MailsBundleKey, State} from "src/web/browser-window/app/store/reducers/db-view";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";

@Component({
    selector: "electron-mail-db-view-mail-tab",
    templateUrl: "./db-view-mail-tab.component.html",
    styleUrls: ["./db-view-mail-tab.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailTabComponent extends DbViewAbstractComponent {
    @HostBinding("class.search-view")
    searchView: boolean = false;

    mailsBundleKey$: Observable<Extract<MailsBundleKey, "folderMailsBundle" | "folderConversationsBundle">> = this.store.pipe(
        select(OptionsSelectors.CONFIG.localDbMailsListViewMode),
        map((localDbMailsListViewMode) => {
            return localDbMailsListViewMode === "plain"
                ? "folderMailsBundle"
                : "folderConversationsBundle";
        }),
    );

    togglingLocalDbMailsListViewMode$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.togglingLocalDbMailsListViewMode)),
        distinctUntilChanged(),
        map((value) => Boolean(value)),
    );

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
            const {folders, selectedFolderData, selectedMail} = instance;

            if (!selectedFolderData) {
                const inbox = folders.system.find((f) => f.folderType === MAIL_FOLDER_TYPE.INBOX);

                if (!inbox) {
                    throw new Error(`Failed to resolve "inbox" folder`);
                }

                this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, selectedFolderData: inbox}));

                return EMPTY;
            }

            return of({
                folders,
                selectedMail,
                selectedFolderData,
            });
        }),
    );

    constructor(
        store: Store<State>,
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
        this.store.dispatch(OPTIONS_ACTIONS.ToggleLocalDbMailsListViewMode());
    }

    // TODO make sure this subscription doesn't trigger undesirable change detection cycle
    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        const element = event.target as Element | undefined;

        if (element && element.classList.contains("prevent-default-event")) {
            event.preventDefault();
        }
    }

    trackFolder(...[, {pk}]: readonly [number, View.Folder]) {
        return pk;
    }

    selectFolder(folder: View.Folder) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({dbAccountPk: this.dbAccountPk, selectedFolderData: folder}));
    }
}
