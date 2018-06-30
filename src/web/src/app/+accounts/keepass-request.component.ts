import {BehaviorSubject, EMPTY, interval, Observable, Subject} from "rxjs";
import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {distinctUntilChanged, scan, switchMap, takeUntil, tap, withLatestFrom} from "rxjs/operators";
import {Store} from "@ngrx/store";

import {CORE_ACTIONS} from "_@web/src/app/store/actions";
import {ElectronService} from "../+core/electron.service";
import {KeePassClientConf, KeePassRef} from "_@shared/model/keepasshttp";
import {State} from "_@web/src/app/store/reducers/root";

@Component({
    selector: `protonmail-desktop-app-keepass-request`,
    templateUrl: "./keepass-request.component.html",
    styleUrls: ["./keepass-request.component.scss"],
})
export class KeePassRequestComponent implements OnInit, OnDestroy {
    paused = false;
    locked = false;
    message?: string;
    wait = 10;
    progressTick = 0;
    passwodRequestTick = 0;

    @Input()
    keePassRef$: Observable<KeePassRef | undefined>;
    @Input()
    keePassClientConf$: Observable<KeePassClientConf>;
    @Input()
    locked$: Observable<boolean> = new BehaviorSubject(false);
    @Output()
    passwordHandler = new EventEmitter<string>();

    unSubscribe$ = new Subject();

    constructor(private store: Store<State>,
                private electronService: ElectronService) {}

    ngOnInit() {
        this.keePassRef$
            .pipe(
                distinctUntilChanged(),
                withLatestFrom(this.keePassClientConf$),
                switchMap(([keePassRef, keePassClientConf]) => {
                    if (!keePassRef) {
                        return EMPTY;
                    }

                    return interval(1000).pipe(
                        scan((remaining) => remaining ? remaining - (this.paused ? 0 : 1) : this.wait, this.wait),
                        distinctUntilChanged(),
                        switchMap((remaining) => {
                            this.progressTick = (this.wait - remaining) * (100 / this.wait);
                            if (remaining) {
                                return EMPTY;
                            }
                            this.wait = this.wait < 30 ? 30 : 60;
                            this.passwodRequestTick++;
                            if (this.passwodRequestTick % 5 === 0) {
                                this.paused = true;
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

        this.locked$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe((locked) => {
                this.locked = locked;
                this.togglePause(locked);
            });
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }

    togglePause(forcedValue?: boolean) {
        this.paused = typeof forcedValue !== "undefined" ? forcedValue : !this.paused;
    }
}
