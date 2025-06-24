import {Component, ElementRef, inject} from "@angular/core";
import {map} from "rxjs/operators";
import {Observable, Subscription} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {getWebLogger} from "src/web/browser-window/util";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    standalone: false,
    selector: "electron-mail-db-metadata-reset-request",
    styleUrls: ["./db-metadata-reset-request.component.scss"],
    templateUrl: "./db-metadata-reset-request.component.html",
})
export class DbMetadataResetRequestComponent implements OnInit, OnDestroy {
    readonly PACKAGE_GITHUB_PROJECT_URL = inject(PACKAGE_GITHUB_PROJECT_URL_TOKEN);
    private readonly store = inject<Store<State>>(Store);
    private readonly elementRef = inject(ElementRef);

    public readonly resettingDbMetadata$: Observable<boolean>;
    private readonly logger = getWebLogger(__filename, nameof(DbMetadataResetRequestComponent));
    private readonly subscription = new Subscription();

    constructor() {
        this.resettingDbMetadata$ = this.store.pipe(
            select(OptionsSelectors.FEATURED.progress),
            map((progress) => Boolean(progress.resettingDbMetadata)),
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

    submit(options?: {reset?: boolean}): void {
        this.store.dispatch(
            OPTIONS_ACTIONS.ResetDbMetadata({reset: options?.reset}),
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
