import {Component, HostListener} from "@angular/core";
import {Location} from "@angular/common";
import {Store} from "@ngrx/store";

import {ACCOUNTS_OUTLET, ERRORS_OUTLET, ESC_KEY, SETTINGS_OUTLET} from "_@web/src/app/app.constants";
import {NAVIGATION_ACTIONS} from "_@web/src/app/store/actions";
import {State} from "_@web/src/app/store/reducers/root";

export type CloseableOutletsType = typeof ERRORS_OUTLET | typeof SETTINGS_OUTLET;

@Component({
    selector: `email-securely-app-app`,
    template: `
        <router-outlet name="${ACCOUNTS_OUTLET}"></router-outlet>
        <router-outlet name="${SETTINGS_OUTLET}"></router-outlet>
        <router-outlet name="${ERRORS_OUTLET}"></router-outlet>
    `,
    styleUrls: ["./app.component.scss"],
})
export class AppComponent {
    private closeableOutlets: CloseableOutletsType[] = [ERRORS_OUTLET, SETTINGS_OUTLET];

    constructor(private location: Location,
                private store: Store<State>) {}

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
