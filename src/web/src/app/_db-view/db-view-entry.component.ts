import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, Renderer2} from "@angular/core";
import {Deferred} from "ts-deferred";
import {Store} from "@ngrx/store";

import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk} from "src/shared/model/database";
import {DbViewEntryComponentInterface} from "src/web/src/app/app.constants";
import {State} from "src/web/src/app/store/reducers/db-view";

type ComponentInterface = Pick<DbViewEntryComponentInterface, Extract<keyof DbViewEntryComponentInterface, string>>;

@Component({
    selector: "email-securely-app-db-view-entry",
    templateUrl: "./db-view-entry.component.html",
    styleUrls: ["./db-view-entry.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewEntryComponent implements ComponentInterface, OnDestroy {
    @Input()
    dbAccountPk!: DbAccountPk;

    private finishDeferred = new Deferred<void>();

    constructor(
        private store: Store<State>,
        private renderer: Renderer2,
        private el: ElementRef,
    ) {}

    // TODO consider dispatching "DB_VIEW_ACTIONS.MountInstance" in "ngAfterViewInit"
    tabComponentInitialized() {
        this.store.dispatch(DB_VIEW_ACTIONS.MountInstance({dbAccountPk: this.dbAccountPk, finishPromise: this.finishDeferred.promise}));
    }

    setVisibility(value: boolean) {
        this.renderer.setStyle(this.el.nativeElement, "display", value ? "flex" : "none");
    }

    ngOnDestroy() {
        this.finishDeferred.resolve();
        this.store.dispatch(DB_VIEW_ACTIONS.UnmountInstance({dbAccountPk: this.dbAccountPk}));
    }
}
