import {BehaviorSubject, EMPTY, interval, Observable, Subscription} from "rxjs";
import {ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {concatMap, distinctUntilChanged, scan, withLatestFrom} from "rxjs/operators";
import {Store} from "@ngrx/store";

import {CORE_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "../+core/electron.service";
import {KeePassClientConf, KeePassRef} from "src/shared/model/keepasshttp";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/root";

interface ComponentState {
    paused: boolean;
    progressTick: number;
    message?: string;
}

@Component({
    selector: "email-securely-app-keepass-request",
    templateUrl: "./keepass-request.component.html",
    styleUrls: ["./keepass-request.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeePassRequestComponent implements OnInit, OnDestroy {
    stateSubject$: BehaviorSubject<ComponentState> = new BehaviorSubject({
        paused: true,
        progressTick: 0,
    });
    @HostBinding("class.d-block")
    visible = false;

    private readonly waitSec = 5;
    private subscription = new Subscription();

    @Input()
    private keePassRef$!: Observable<KeePassRef | undefined>;
    @Input()
    private keePassClientConf$!: Observable<KeePassClientConf>;
    @Output()
    private passwordHandler = new EventEmitter<string>();

    constructor(
        private store: Store<State>,
        private electronService: ElectronService,
    ) {}

    get state$() {
        return this.stateSubject$.asObservable();
    }

    ngOnInit() {
        this.subscription.add(
            this.keePassRef$
                .pipe(
                    distinctUntilChanged(),
                    withLatestFrom(this.keePassClientConf$),
                    concatMap(([keePassRef, keePassClientConf]) => {
                        this.patchState({paused: false});
                        this.visible = true;

                        if (!keePassRef) {
                            this.patchState({paused: true});
                            this.visible = false;
                            return EMPTY;
                        }

                        return interval(ONE_SECOND_MS).pipe(
                            scan(
                                (remaining) => remaining ? remaining - (this.stateSubject$.value.paused ? 0 : 1) : this.waitSec,
                                this.waitSec,
                            ),
                            distinctUntilChanged(),
                            concatMap((remaining) => {
                                this.patchState({progressTick: (this.waitSec - remaining) * (100 / this.waitSec)});
                                if (remaining) {
                                    return EMPTY;
                                }
                                return this.electronService.keePassPassword(keePassClientConf, keePassRef, true);
                            }),
                        );
                    }),
                )
                .subscribe(
                    ({password, message}) => {
                        if (password) {
                            this.passwordHandler.emit(password);
                            this.patchState({message: "Password received"});
                        } else {
                            this.patchState({message});
                        }
                    },
                    (err) => {
                        this.store.dispatch(CORE_ACTIONS.Fail(err));
                    },
                ),
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    togglePause(forcedValue?: boolean) {
        this.patchState({paused: typeof forcedValue !== "undefined" ? forcedValue : !this.stateSubject$.value.paused});
    }

    private patchState(patch: Partial<ComponentState>) {
        this.stateSubject$.next({...this.stateSubject$.value, ...patch});
    }
}
