import {ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {Deferred} from "ts-deferred";
import {ReplaySubject, Subscription, merge} from "rxjs";
import {debounceTime, filter, switchMap} from "rxjs/operators";

// import {DbViewEntryComponent as ComponentInterface} from "src/web/src/app/app.constants";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {MemoryDb} from "src/shared/model/database";
import {Unpacked} from "src/shared/types";

interface ComponentState {
    account: Unpacked<ReturnType<Endpoints["dbGetAccountData"]>>;
}

@Component({
    selector: "email-securely-app-db-view-entry",
    templateUrl: "./db-view-entry.component.html",
    styleUrls: ["./db-view-entry.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewEntryComponent implements OnDestroy, OnInit { // TODO implement "ComponentInterface"  interface
    @Input()
    key!: { type: keyof MemoryDb, login: string };

    private stateSubject$ = new ReplaySubject<ComponentState>(1);

    // tslint:disable-next-line:member-ordering
    state$ = this.stateSubject$.asObservable();

    private subscription = new Subscription();

    constructor(
        private electronService: ElectronService,
    ) {}

    ngOnInit() {
        const notificationDeferred = new Deferred<void>();
        const ipcMainClient = this.electronService.ipcMainClient({finishPromise: notificationDeferred.promise});

        this.subscription.add({unsubscribe: () => notificationDeferred.resolve()});

        this.subscription.add(
            merge(
                ipcMainClient("notification")().pipe(
                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                    // tslint:disable-next-line:ban
                    switchMap(({payload}) => {
                        return ipcMainClient("dbGetAccountData")(this.key);
                    }),
                ),
                // initial load
                ipcMainClient("dbGetAccountData")(this.key),
            ).pipe(
                debounceTime(300),
            ).subscribe((account) => {
                this.stateSubject$.next({account});
            }),
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
