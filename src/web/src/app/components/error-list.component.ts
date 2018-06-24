import {pairwise, takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";
import {ChangeDetectionStrategy, Component, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";

import {ERRORS_OUTLET} from "_@web/src/app/app.constants";
import {CoreActions, NavigationActions} from "_@web/src/app/store/actions";
import {errorsSelector, State} from "_@web/src/app/store/reducers/errors";

@Component({
    selector: `protonmail-desktop-app-error-list-request`,
    templateUrl: "./error-list.component.html",
    styleUrls: ["./error-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorListComponent implements OnInit, OnDestroy {
    $errors = this.store.select(errorsSelector);
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
        this.store.dispatch(new NavigationActions.Go({path: [{outlets: {[ERRORS_OUTLET]: null}}]}));
    }

    onRemove(error: Error) {
        this.store.dispatch(new CoreActions.RemoveError(error));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
