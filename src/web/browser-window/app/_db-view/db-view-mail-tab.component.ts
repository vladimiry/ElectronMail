import {ChangeDetectionStrategy, Component, HostBinding, HostListener} from "@angular/core";
import {EMPTY, Observable, of} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map, mergeMap} from "rxjs/operators";

import {DB_VIEW_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS, View} from "src/shared/model/database";
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
    searchView = false;

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
                const unread = folders.system.find(({id}) => id === SYSTEM_FOLDER_IDENTIFIERS["Virtual Unread"]);

                if (!unread) {
                    throw new Error(`Failed to resolve "unread" virtual folder`);
                }

                this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({webAccountPk: this.webAccountPk, selectedFolderData: unread}));

                return EMPTY;
            }

            return of({
                systemFolders: folders.system,
                customFolders: folders.custom.filter(({type}) => type === LABEL_TYPE.MESSAGE_FOLDER),
                customLabels: folders.custom.filter(({type}) => type === LABEL_TYPE.MESSAGE_LABEL),
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

    toggleSearchView(): void {
        const {webAccountPk} = this;

        this.store.dispatch(DB_VIEW_ACTIONS.SelectMail({webAccountPk}));

        for (const mailsBundleKey of ["searchMailsBundle", "searchNoQueryMailsBundle"] as const) {
            this.store.dispatch(DB_VIEW_ACTIONS.ResetSearchMailsBundleItems({webAccountPk, mailsBundleKey}));
        }

        this.searchView = !this.searchView;
    }

    toggleMailsBundleKey(): void {
        this.store.dispatch(OPTIONS_ACTIONS.ToggleLocalDbMailsListViewMode());
    }

    // TODO make sure this subscription doesn't trigger undesirable change detection cycle
    @HostListener("click", ["$event"])
    onClick(event: MouseEvent): void {
        const element = event.target as Element | undefined;

        if (element && element.classList.contains("prevent-default-event")) {
            event.preventDefault();
        }
    }

    trackFolder(...[, {id}]: readonly [number, View.Folder]): View.Folder["id"] {
        return id;
    }

    selectFolder(folder: View.Folder): void {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectFolder({webAccountPk: this.webAccountPk, selectedFolderData: folder}));
    }
}
