import {BehaviorSubject, Subject} from "rxjs";
import {ChangeDetectionStrategy, Component, Input, OnDestroy} from "@angular/core";
import {Store} from "@ngrx/store";
import {filter, finalize, takeUntil, throttleTime} from "rxjs/operators";

import {CORE_ACTIONS} from "src/web/src/app/store/actions";
import {DbViewAbstractComponent} from "src/web/src/app/_db-view/db-view-abstract.component";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {MailsBundle, State} from "src/web/src/app/store/reducers/db-view";
import {ONE_SECOND_MS} from "src/shared/constants";
import {View} from "src/shared/model/database";
import {filterConversationNodesMails} from "src/shared/util";

@Component({
    selector: "electron-mail-db-view-mails-export",
    templateUrl: "./db-view-mails-export.component.html",
    styleUrls: ["./db-view-mails-export.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsExportComponent extends DbViewAbstractComponent implements OnDestroy {
    $state = new BehaviorSubject<{ exporting?: boolean }>({});

    @Input()
    popupPlacement?: string = "bottom";

    @Input()
    title!: string;

    @Input()
    mailsBundleItems?: MailsBundle["items"];

    @Input()
    rootConversationNode?: View.RootConversationNode;

    private unSubscribe$ = new Subject();

    constructor(
        store: Store<State>,
        private api: ElectronService,
    ) {
        super(store);
    }

    export() {
        const mails: View.Mail[] = this.mailsBundleItems
            ? this.mailsBundleItems.map(({mail}) => mail)
            : this.rootConversationNode
                ? filterConversationNodesMails([this.rootConversationNode])
                : [];
        const arg = {
            ...this.dbAccountPk,
            ...(mails.length && {mailPks: mails.map(({pk}) => pk)}),
        };

        this.api.ipcMainClient({timeoutMs: ONE_SECOND_MS * 30})("dbExport")(arg)
            .pipe(
                takeUntil(this.unSubscribe$),
                filter((value) => "progress" in value),
                throttleTime(ONE_SECOND_MS / 2),
                finalize(() => {
                    this.$state.next({exporting: false});
                }),
            )
            .subscribe(
                () => {
                    if (this.$state.value.exporting) {
                        return;
                    }
                    this.$state.next({exporting: true});
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
