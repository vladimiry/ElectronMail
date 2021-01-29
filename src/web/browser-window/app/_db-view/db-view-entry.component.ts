import {ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {Deferred} from "ts-deferred";
import {Store} from "@ngrx/store";

import {DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {State} from "src/web/browser-window/app/store/reducers/db-view";
import {WebAccountPk} from "src/web/browser-window/app/model";

@Component({
    selector: "electron-mail-db-view-entry",
    templateUrl: "./db-view-entry.component.html",
    styleUrls: ["./db-view-entry.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewEntryComponent implements OnDestroy, OnInit {
    @Input()
    webAccountPk!: WebAccountPk;

    private finishDeferred = new Deferred<void>();

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit(): void {
        this.store.dispatch(
            DB_VIEW_ACTIONS.MountInstance({webAccountPk: this.webAccountPk, finishPromise: this.finishDeferred.promise}),
        );
    }

    ngOnDestroy(): void {
        this.finishDeferred.resolve();
        this.store.dispatch(DB_VIEW_ACTIONS.UnmountInstance({webAccountPk: this.webAccountPk}));
    }
}
