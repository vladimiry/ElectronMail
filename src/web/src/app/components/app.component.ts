import {Component, HostListener} from "@angular/core";
import {Location} from "@angular/common";
import {Store} from "@ngrx/store";

import {ACCOUNTS_OUTLET, ERRORS_OUTLET, ESC_KEY_CODE, SETTINGS_OUTLET} from "_web_app/app.constants";
import {NavigationActions} from "_web_app/store/actions";
import {State} from "_web_app/store/reducers/root";

@Component({
    selector: `protonmail-desktop-app-app`,
    template: `
        <router-outlet name="${ACCOUNTS_OUTLET}"></router-outlet>
        <router-outlet name="${SETTINGS_OUTLET}"></router-outlet>
        <router-outlet name="${ERRORS_OUTLET}"></router-outlet>
    `,
    styleUrls: ["./app.component.scss"],
})
export class AppComponent {
    constructor(private location: Location,
                private store: Store<State>) {}

    @HostListener("document:keyup", ["$event"])
    onKeyUp(ev: KeyboardEvent) {
        if (ev.keyCode !== ESC_KEY_CODE) {
            return;
        }

        const hash = this.location.path(true);

        if (hash.indexOf(`${ERRORS_OUTLET}:`) !== -1) {
            this.close(ERRORS_OUTLET);
            return;
        }

        if (hash.indexOf(`${SETTINGS_OUTLET}:`) !== -1) {
            this.close(SETTINGS_OUTLET);
            return;
        }
    }

    private close(outlet: string) {
        this.store.dispatch(new NavigationActions.Go({path: [{outlets: {[outlet]: null}}]}));
    }
}
