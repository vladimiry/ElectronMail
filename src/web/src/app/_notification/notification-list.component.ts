import {ChangeDetectionStrategy, Component, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";
import {Subscription} from "rxjs";
import {pairwise} from "rxjs/operators";

import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/src/app/store/actions";
import {NOTIFICATIONS_OUTLET} from "src/web/src/app/app.constants";
import {NotificationItem} from "src/web/src/app/store/actions/notification";
import {NotificationSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/notification";

@Component({
    selector: "electron-mail-notification-list",
    templateUrl: "./notification-list.component.html",
    styleUrls: ["./notification-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationListComponent implements OnInit, OnDestroy {
    $items = this.store.select(NotificationSelectors.FEATURED.items);

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit() {
        this.subscription.add(
            this.$items
                .pipe(
                    pairwise(),
                )
                .subscribe(([prev, current]) => {
                    if (prev.length && !current.length) {
                        this.close();
                    }
                }),
        );
    }

    close() {
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[NOTIFICATIONS_OUTLET]: null}}],
            }),
        );
    }

    onRemove(item: NotificationItem) {
        this.store.dispatch(NOTIFICATION_ACTIONS.Remove(item));
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
