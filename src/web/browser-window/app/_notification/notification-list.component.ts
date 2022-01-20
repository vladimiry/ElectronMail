import {ChangeDetectionStrategy, Component, ElementRef} from "@angular/core";
import {Observable, Subscription} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {pairwise} from "rxjs/operators";
import {Store} from "@ngrx/store";

import {getWebLogger} from "src/web/browser-window/util";
import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NotificationItem} from "src/web/browser-window/app/store/actions/notification";
import {NOTIFICATIONS_OUTLET} from "src/web/browser-window/app/app.constants";
import {NotificationSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/notification";

@Component({
    selector: "electron-mail-notification-list",
    templateUrl: "./notification-list.component.html",
    styleUrls: ["./notification-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationListComponent implements OnInit, OnDestroy {
    $items: Observable<NotificationItem[]>;

    private readonly logger = getWebLogger(__filename, nameof(NotificationListComponent));

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
        private elementRef: ElementRef,
    ) {
        this.$items = this.store.select(NotificationSelectors.FEATURED.items);
    }

    ngOnInit(): void {
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

    close(): void {
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[NOTIFICATIONS_OUTLET]: null}}],
            }),
        );
    }

    onRemove(item: NotificationItem): void {
        this.store.dispatch(NOTIFICATION_ACTIONS.Remove(item));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
