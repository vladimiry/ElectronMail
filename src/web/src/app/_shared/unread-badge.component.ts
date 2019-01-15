import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {Subject} from "rxjs";
import {takeUntil} from "rxjs/operators";

import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-unread-badge",
    templateUrl: "./unread-badge.component.html",
    styleUrls: ["./unread-badge.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnreadBadgeComponent implements OnInit, OnDestroy {
    @Input()
    value!: number;

    unSubscribe$ = new Subject();

    constructor(
        private store: Store<State>,
        private elementRef: ElementRef,
    ) {}

    ngOnInit() {
        this.store
            .pipe(
                select(OptionsSelectors.CONFIG.unreadBgColor),
                takeUntil(this.unSubscribe$),
            )
            .subscribe((value) => {
                // TODO validate that value is actually a color
                this.elementRef.nativeElement.style.backgroundColor = value;
            });
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
