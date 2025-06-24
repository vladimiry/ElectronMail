import {ChangeDetectionStrategy, Component, ElementRef, inject, Input, Renderer2} from "@angular/core";
import {Observable, Subscription} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    standalone: false,
    selector: "electron-mail-unread-badge",
    templateUrl: "./unread-badge.component.html",
    styleUrls: ["./unread-badge.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnreadBadgeComponent implements OnInit, OnDestroy {
    private readonly store = inject<Store<State>>(Store);
    private readonly elementRef = inject(ElementRef);
    private readonly renderer = inject(Renderer2);

    @Input({required: true})
    value!: number;

    @Input({required: false})
    alwaysRenderTheValue = false;

    readonly doNotRenderNotificationBadgeValue$: Observable<boolean>;

    private readonly subscription = new Subscription();

    constructor() {
        this.doNotRenderNotificationBadgeValue$ = this.store.pipe(select(OptionsSelectors.CONFIG.doNotRenderNotificationBadgeValue));
    }

    ngOnInit(): void {
        this.subscription.add(
            this.store
                .pipe(select(OptionsSelectors.CONFIG.unreadBgColor))
                .subscribe((value) => this.setStyle("backgroundColor", value)),
        );
        this.subscription.add(
            this.store
                .pipe(select(OptionsSelectors.CONFIG.unreadTextColor))
                .subscribe((value) => this.setStyle("color", value)),
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private setStyle(prop: "backgroundColor" | "color", value: string): void {
        this.renderer.setStyle(this.elementRef.nativeElement, prop, value);
    }
}
