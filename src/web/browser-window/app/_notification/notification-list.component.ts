import {ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription} from "rxjs";
import {Store} from "@ngrx/store";
import {pairwise} from "rxjs/operators";

import {NAVIGATION_ACTIONS, NOTIFICATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {NOTIFICATIONS_OUTLET} from "src/web/browser-window/app/app.constants";
import {NotificationItem} from "src/web/browser-window/app/store/actions/notification";
import {NotificationSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/notification";
import {getWebLogger} from "src/web/browser-window/util";

@Component({
    selector: "electron-mail-notification-list",
    templateUrl: "./notification-list.component.html",
    styleUrls: ["./notification-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationListComponent implements OnInit, OnDestroy {
    $items: Observable<NotificationItem[]> = this.store.select(NotificationSelectors.FEATURED.items);

    private readonly logger = getWebLogger();

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
        private elementRef: ElementRef,
    ) {}

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
