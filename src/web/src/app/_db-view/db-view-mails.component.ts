import {ChangeDetectionStrategy, Component, HostListener, Input} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {combineLatest} from "rxjs";
import {map, mergeMap} from "rxjs/operators";

import {DB_VIEW_ACTIONS} from "../store/actions";
import {DbAccountPk, FolderWithMailsReference as Folder} from "src/shared/model/database";
import {DbViewUtil} from "./util";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {ObservableNgChangesComponent} from "src/web/src/app/components/observable-ng-changes.component";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent extends ObservableNgChangesComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    state$ = combineLatest(
        this.store.pipe(
            select((state) => FEATURED.accountRecord(this.dbAccountPk)(state)),
            mergeMap((account) => account ? [account] : []),
        ),
        this.ngOnChangesObservable("dbAccountPk"),
    ).pipe(
        map(([{data, filters}]) => {
            const state = {
                folders: data.folders,
                selectedFolderMails: data.folders
                    .filter((folder) => folder.pk === filters.selectedFolderPk)
                    .reduce((mailsAccumulator: typeof mails, {mails}) => mailsAccumulator.concat(mails), []),
                selectedFolderPk: filters.selectedFolderPk,
            };

            // TODO enable custom sorting
            state.selectedFolderMails.sort((o1, o2) => o2.date - o1.date);

            return state;
        }),
    );
    trackByEntityPk = DbViewUtil.trackByEntityPk;

    constructor(
        private store: Store<State>,
    ) {
        super();
    }

    selectFolder({pk: selectedFolderPk}: Folder) {
        this.store.dispatch(DB_VIEW_ACTIONS.PatchInstanceFilters({dbAccountPk: this.dbAccountPk, patch: {selectedFolderPk}}));
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        if (!event.srcElement || !event.srcElement.classList.contains("sender")) {
            return;
        }
        event.preventDefault();
    }
}
