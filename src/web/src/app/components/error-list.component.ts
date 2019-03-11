import {ChangeDetectionStrategy, Component, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";
import {Subject} from "rxjs";
import {pairwise, takeUntil} from "rxjs/operators";

import {CORE_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {ERRORS_OUTLET} from "src/web/src/app/app.constants";
import {ErrorsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/errors";

@Component({
    selector: "electron-mail-error-list-request",
    templateUrl: "./error-list.component.html",
    styleUrls: ["./error-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorListComponent implements OnInit, OnDestroy {
    $errors = this.store.select(ErrorsSelectors.FEATURED.errors);
    unSubscribe$ = new Subject();

    constructor(private store: Store<State>) {}

    ngOnInit() {
        this.$errors
            .pipe(
                pairwise(),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(([prev, current]) => {
                if (prev.length && !current.length) {
                    this.close();
                }
            });
    }

    close() {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({path: [{outlets: {[ERRORS_OUTLET]: null}}]}));
    }

    onRemove(error: Error) {
        this.store.dispatch(CORE_ACTIONS.RemoveError(error));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
