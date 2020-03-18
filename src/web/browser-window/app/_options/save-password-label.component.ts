import {Component, ElementRef, Input, OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {Subscription} from "rxjs";

import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PACKAGE_NAME} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

@Component({
    selector: "electron-mail-save-password-label",
    templateUrl: "./save-password-label.component.html",
})
export class SavePasswordLabelComponent implements OnInit, OnDestroy {
    @Input()
    savePassword = false;

    keytarUnsupportedDetails = false;

    readonly keytarSupport$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.keytarSupport),
    );

    readonly projectName = PACKAGE_NAME;

    readonly snapPasswordManagerServiceHint$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.snapPasswordManagerServiceHint),
    );

    private readonly logger = getZoneNameBoundWebLogger("[save-password-label]");

    private readonly subscription = new Subscription();

    constructor(
        private readonly store: Store<State>,
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
    }

    openSettingsFolder(event: Event): void {
        event.preventDefault();
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }

    toggleKeytarUnsupportedDetails(event: Event): void {
        event.preventDefault();
        this.keytarUnsupportedDetails = !this.keytarUnsupportedDetails;
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
