import {Component, HostListener} from "@angular/core";
import {Location} from "@angular/common";
import {Store} from "@ngrx/store";
import {map} from "rxjs/operators";

import {ACCOUNTS_OUTLET, ERRORS_OUTLET, ESC_KEY, SETTINGS_OUTLET} from "src/web/src/app/app.constants";
import {NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/root";

export type CloseableOutletsType = typeof ERRORS_OUTLET | typeof SETTINGS_OUTLET;

@Component({
    selector: "email-securely-app-app",
    template: `
        <div class="info" *ngIf="bootStrappingIndex$ | async">
            <div class="progress d-flex flex-grow-1">
                <div class="progress-bar progress-bar-striped progress-bar-animated bg-secondary" style="width: 100%">
                    Bootstrapping search index... Please wait.
                </div>
            </div>
        </div>
        <router-outlet name="${ACCOUNTS_OUTLET}"></router-outlet>
        <router-outlet name="${SETTINGS_OUTLET}"></router-outlet>
        <router-outlet name="${ERRORS_OUTLET}"></router-outlet>
    `,
    styleUrls: ["./app.component.scss"],
})
export class AppComponent {
    bootStrappingIndex$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.bootStrappingIndex));

    private closeableOutlets: CloseableOutletsType[] = [ERRORS_OUTLET, SETTINGS_OUTLET];

    constructor(
        private location: Location,
        private store: Store<State>,
    ) {}

    @HostListener("document:keyup", ["$event"])
    onKeyUp({key}: KeyboardEvent) {
        if (key !== ESC_KEY) {
            return;
        }

        const hash = this.location.path(true);

        for (const outlet of this.closeableOutlets) {
            if (hash.indexOf(`${outlet}:`) !== -1) {
                this.closeOutlet(outlet);
                return;
            }
        }
    }

    private closeOutlet(outlet: CloseableOutletsType) {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({path: [{outlets: {[outlet]: null}}]}));
    }
}
