import {Observable, Subscription} from "rxjs";
import {Store, select} from "@ngrx/store";
import {map} from "rxjs/operators";

import {Component, ElementRef, Inject} from "@angular/core";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import type {OnDestroy, OnInit} from "@angular/core";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getWebLogger} from "src/web/browser-window/util";

@Component({
    selector: "electron-mail-db-metadata-reset-request",
    styleUrls: ["./db-metadata-reset-request.component.scss"],
    templateUrl: "./db-metadata-reset-request.component.html",
})
export class DbMetadataResetRequestComponent implements OnInit, OnDestroy {
    public readonly resettingDbMetadata$: Observable<boolean>;
    private readonly logger = getWebLogger(__filename, nameof(DbMetadataResetRequestComponent));
    private readonly subscription = new Subscription();

    constructor(
        @Inject(PACKAGE_GITHUB_PROJECT_URL_TOKEN)
        public readonly PACKAGE_GITHUB_PROJECT_URL: string,
        private readonly store: Store<State>,
        private readonly elementRef: ElementRef,
    ) {
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

    submit(options?: { reset?: boolean }): void {
        this.store.dispatch(
            OPTIONS_ACTIONS.ResetDbMetadata({reset: options?.reset}),
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
