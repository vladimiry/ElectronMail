import {BehaviorSubject, Subject} from "rxjs";
import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {Store} from "@ngrx/store";
import {filter, finalize, takeUntil, throttleTime} from "rxjs/operators";
import {subscribableLikeToObservable} from "electron-rpc-api";

import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {MailsBundle, State} from "src/web/browser-window/app/store/reducers/db-view";
import {NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {ONE_SECOND_MS} from "src/shared/constants";
import {View} from "src/shared/model/database";
import {filterConversationNodesMails} from "src/shared/util";

@Component({
    selector: "electron-mail-db-view-mails-export",
    templateUrl: "./db-view-mails-export.component.html",
    styleUrls: ["./db-view-mails-export.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsExportComponent extends DbViewAbstractComponent {
    $state = new BehaviorSubject<{ exporting?: boolean }>({});

    @Input()
    popupPlacement?: "bottom" | "top" = "bottom";

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

        subscribableLikeToObservable(this.api.ipcMainClient({timeoutMs: ONE_SECOND_MS * 30})("dbExport")(arg))
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
                (error) => this.store.dispatch(NOTIFICATION_ACTIONS.Error(error)),
            );
    }
}
