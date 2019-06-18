import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit, Renderer2} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {Subscription} from "rxjs";

import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-unread-badge",
    templateUrl: "./unread-badge.component.html",
    styleUrls: ["./unread-badge.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnreadBadgeComponent implements OnInit, OnDestroy {
    @Input()
    value!: number;

    subscription = new Subscription();

    constructor(
        private store: Store<State>,
        private elementRef: ElementRef,
        private renderer: Renderer2,
    ) {}

    ngOnInit() {
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

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    private setStyle(prop: "backgroundColor" | "color", value: string) {
        this.renderer.setStyle(this.elementRef.nativeElement, prop, value);
    }
}
