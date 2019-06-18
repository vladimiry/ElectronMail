import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit, Renderer2} from "@angular/core";
import {Deferred} from "ts-deferred";
import {Store} from "@ngrx/store";

import {DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DbAccountPk} from "src/shared/model/database";
import {DbViewEntryComponentInterface} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/db-view";

type ComponentInterface = Pick<DbViewEntryComponentInterface, Extract<keyof DbViewEntryComponentInterface, string>>;

@Component({
    selector: "electron-mail-db-view-entry",
    templateUrl: "./db-view-entry.component.html",
    styleUrls: ["./db-view-entry.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewEntryComponent implements ComponentInterface, OnDestroy, OnInit {
    @Input()
    dbAccountPk!: DbAccountPk;

    private finishDeferred = new Deferred<void>();

    constructor(
        private store: Store<State>,
        private renderer: Renderer2,
        private el: ElementRef,
    ) {}

    ngOnInit() {
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
