import {Component, EventEmitter, HostBinding, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {concatMap, distinctUntilChanged, scan, takeUntil, withLatestFrom} from "rxjs/operators";
import {EMPTY, interval, Observable, Subject} from "rxjs";
import {Store} from "@ngrx/store";

import {CORE_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "../+core/electron.service";
import {KeePassClientConf, KeePassRef} from "src/shared/model/keepasshttp";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/root";

@Component({
    selector: "email-securely-app-keepass-request",
    templateUrl: "./keepass-request.component.html",
    styleUrls: ["./keepass-request.component.scss"],
})
export class KeePassRequestComponent implements OnInit, OnDestroy {
    @HostBinding("class.d-block")
    visible = false;
    paused = true;
    message?: string;
    readonly waitSec = 5;
    progressTick = 0;

    @Input()
    keePassRef$: Observable<KeePassRef | undefined>;
    @Input()
    keePassClientConf$: Observable<KeePassClientConf>;
    @Output()
    passwordHandler = new EventEmitter<string>();

    unSubscribe$ = new Subject();

    constructor(
        private store: Store<State>,
        private electronService: ElectronService,
    ) {}

    ngOnInit() {
        this.keePassRef$
            .pipe(
                distinctUntilChanged(),
                withLatestFrom(this.keePassClientConf$),
                concatMap(([keePassRef, keePassClientConf]) => {
                    this.paused = false;
                    this.visible = true;

                    if (!keePassRef) {
                        this.paused = true;
                        this.visible = false;
                        return EMPTY;
                    }

                    return interval(ONE_SECOND_MS).pipe(
                        scan((remaining) => remaining ? remaining - (this.paused ? 0 : 1) : this.waitSec, this.waitSec),
                        distinctUntilChanged(),
                        concatMap((remaining) => {
                            this.progressTick = (this.waitSec - remaining) * (100 / this.waitSec);

                            if (remaining) {
                                return EMPTY;
                            }

                            return this.electronService.keePassPassword(keePassClientConf, keePassRef, true);
                        }),
                    );
                }),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(
                ({password, message}) => {
                    if (password) {
                        this.passwordHandler.emit(password);
                        this.message = "Password received";
                    } else {
                        this.message = message;
                    }
                },
                (err) => {
                    this.store.dispatch(CORE_ACTIONS.Fail(err));
                },
            );
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }

    togglePause(forcedValue?: boolean) {
        this.paused = typeof forcedValue !== "undefined" ? forcedValue : !this.paused;
    }
}
