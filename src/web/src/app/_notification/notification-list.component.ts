import {ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";
import {Subscription} from "rxjs";
import {pairwise} from "rxjs/operators";

import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/src/app/store/actions";
import {NOTIFICATIONS_OUTLET} from "src/web/src/app/app.constants";
import {NotificationItem} from "src/web/src/app/store/actions/notification";
import {NotificationSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/notification";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

@Component({
    selector: "electron-mail-notification-list",
    templateUrl: "./notification-list.component.html",
    styleUrls: ["./notification-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationListComponent implements OnInit, OnDestroy {
    $items = this.store.select(NotificationSelectors.FEATURED.items);

    private readonly logger = getZoneNameBoundWebLogger();

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
        private elementRef: ElementRef,
    ) {}

    ngOnInit() {
        this.subscription.add({
            unsubscribe: __ELECTRON_EXPOSURE__
                .registerDocumentClickEventListener(
                    this.elementRef.nativeElement,
                    this.logger,
                )
                .unsubscribe,
        });

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
