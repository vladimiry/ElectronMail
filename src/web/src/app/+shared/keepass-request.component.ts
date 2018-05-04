import {catchError, distinctUntilChanged, filter, mergeMap, scan, switchMap, takeUntil, withLatestFrom, mapTo} from "rxjs/operators";
import {Observable, BehaviorSubject, Subject, interval, of} from "rxjs";
import {Component, EventEmitter, HostBinding, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {Store} from "@ngrx/store";

import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";
import {CoreActions} from "_web_app/store/actions";
import {ElectronService} from "../+core/electron.service";

type NumericObservable = Observable<number>;

@Component({
    selector: `protonmail-desktop-app-keepass-request`,
    templateUrl: "./keepass-request.component.html",
    styleUrls: ["./keepass-request.component.scss"],
})
export class KeePassRequestComponent implements OnInit, OnDestroy {
    tick = 0;
    message?: string;
    locked?: boolean;

    @HostBinding("class.d-block")
    enabled: boolean;

    @Input()
    keePassRef$: Observable<KeePassRef | undefined>;
    @Input()
    keePassClientConf$: Observable<KeePassClientConf>;
    @Input()
    lock$: Observable<boolean> = new BehaviorSubject(false);
    @Output()
    passwordHandler = new EventEmitter<string>();

    // TODO might be useful to make "countdownSeconds" configurable via component's attribute
    countdownSeconds = 5;
    unSubscribe$ = new Subject();
    interval$: NumericObservable = interval(1000).pipe(mapTo(-1));
    counter$: BehaviorSubject<NumericObservable> = new BehaviorSubject(of(0));
    progress$: BehaviorSubject<boolean> = new BehaviorSubject(false);

    // TODO pass store generic type from the outside
    constructor(private store: Store<any>,
                private electronService: ElectronService) {}

    ngOnInit() {
        this.keePassRef$
            .pipe(
                distinctUntilChanged(),
                mergeMap((keePassRef?: KeePassRef) => {
                    this.enabled = !!keePassRef;
                    this.counter$.next(this.enabled ? this.interval$ : of(0));

                    if (!keePassRef) {
                        return [];
                    }

                    // TODO consider moving this to the "effects" service
                    // ie keep a component dump by interacting with the "store" only
                    // but in this case password would have to be passed through the in the store - not a perfect idea
                    return [
                        this.progress(false).pipe(
                            switchMap(() => this.counter$.pipe(
                                switchMap((val) => val),
                                takeUntil(this.progress(true)),
                                scan((remaining, val) => val ? val + remaining : remaining, this.countdownSeconds),
                            )),
                            withLatestFrom(this.keePassClientConf$),
                            mergeMap(([remaining, keePassClientConf]) => {
                                const result = [];

                                this.tick = (this.countdownSeconds - remaining) * (100 / this.countdownSeconds);

                                if (remaining === 0) {
                                    this.progress$.next(true);
                                    result.push(
                                        this.electronService.keePassPassword(keePassClientConf, keePassRef, true)
                                            .pipe(catchError((error) => of(error))),
                                    );
                                }

                                return result;
                            }),
                        ),
                    ];
                }),
                switchMap((val) => val),
                switchMap((val) => val),
                takeUntil(this.unSubscribe$),
            )
            .subscribe((arg) => {
                this.progress$.next(false);

                if (arg instanceof Error) {
                    this.store.dispatch(new CoreActions.Fail(arg));
                }

                const {password, message} = arg;

                if (password) {
                    this.passwordHandler.emit(password);
                    this.message = "Password received";
                } else {
                    this.message = message;
                }
            });

        this.lock$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe((locked) => {
                this.locked = locked;
                this.toggle(!locked);
            });
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }

    toggle(enable?: boolean) {
        const enabled = typeof enable !== "undefined"
            ? !enable
            : this.counter$.getValue() === this.interval$;

        this.counter$.next(enabled ? of(0) : this.interval$);
    }

    progress(value: boolean) {
        return this.progress$
            .pipe(filter((progressValue) => progressValue === value));
    }
}
