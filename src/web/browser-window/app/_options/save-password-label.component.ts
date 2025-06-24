import {Component, ElementRef, inject, Input} from "@angular/core";
import {Observable, Subscription} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {getWebLogger} from "src/web/browser-window/util";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "src/web/browser-window/app/app.constants";
import {PACKAGE_NAME} from "src/shared/const";
import {SAVE_PASSWORD_WARN_TRUSTED_HTML} from "./const";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    standalone: false,
    selector: "electron-mail-save-password-label",
    templateUrl: "./save-password-label.component.html",
})
export class SavePasswordLabelComponent implements OnInit, OnDestroy {
    readonly PACKAGE_GITHUB_PROJECT_URL = inject(PACKAGE_GITHUB_PROJECT_URL_TOKEN);
    private readonly store = inject<Store<State>>(Store);
    private readonly elementRef = inject(ElementRef);

    readonly userDataDir = __METADATA__.electronLocations.userDataDir;

    @Input({required: true})
    savePassword: boolean | null = false;

    keytarUnsupportedDetails = false;

    readonly savePasswordWarnHtmlMessage = SAVE_PASSWORD_WARN_TRUSTED_HTML;

    readonly projectName = PACKAGE_NAME;

    readonly keytarSupport$: Observable<boolean | undefined>;

    readonly snapPasswordManagerServiceHint$: Observable<boolean | undefined>;

    private readonly logger = getWebLogger(__filename, nameof(SavePasswordLabelComponent));

    private readonly subscription = new Subscription();

    constructor() {
        this.keytarSupport$ = this.store.pipe(
            select(OptionsSelectors.FEATURED.keytarSupport),
        );
        this.snapPasswordManagerServiceHint$ = this.store.pipe(
            select(OptionsSelectors.FEATURED.snapPasswordManagerServiceHint),
        );
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
    }

    openSettingsFolder(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }

    toggleKeytarUnsupportedDetails(): void {
        this.keytarUnsupportedDetails = !this.keytarUnsupportedDetails;
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
