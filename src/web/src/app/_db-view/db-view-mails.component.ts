import {ChangeDetectionStrategy, Component, HostListener, Input} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {combineLatest} from "rxjs";
import {map, mergeMap} from "rxjs/operators";

import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions/db-view";
import {DbAccountPk, View} from "src/shared/model/database";
import {DbViewUtil} from "./util";
import {FEATURED} from "src/web/src/app/store/selectors/db-view";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent extends NgChangesObservableComponent {
    @Input()
    dbAccountPk!: DbAccountPk;

    state$ = combineLatest(
        this.store.pipe(
            select((state) => FEATURED.accountRecord(this.dbAccountPk)(state)),
            mergeMap((account) => account ? [account] : []),
        ),
        this.ngChangesObservable("dbAccountPk"),
    ).pipe(
        map(([{data, filters}]) => {
            const state = {
                folders: data.folders,
                rootConversationNodes: data.folders.system.concat(data.folders.custom)
                    .filter((folder) => folder.pk === filters.selectedFolderPk)
                    .reduce((list: typeof rootConversationNodes, {rootConversationNodes}) => list.concat(rootConversationNodes), []),
                selectedFolderPk: filters.selectedFolderPk,
            };

            // desc sort order, newest conversations first
            state.rootConversationNodes.sort((o1, o2) => o2.summary.sentDateMax - o1.summary.sentDateMax);

            return state;
        }),
    );

    trackByEntityPk = DbViewUtil.trackByEntityPk;

    constructor(
        private store: Store<State>,
    ) {
        super();
    }

    selectFolder({pk: selectedFolderPk}: View.Folder) {
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
