import {Component, HostListener, inject} from "@angular/core";
import {Location} from "@angular/common";
import {setTheme} from "ngx-bootstrap/utils";
import {Store} from "@ngrx/store";

import {ACCOUNTS_OUTLET, ESC_KEY, NOTIFICATIONS_OUTLET, SETTINGS_OUTLET, STUB_OUTLET} from "src/web/browser-window/app/app.constants";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {State} from "src/web/browser-window/app/store/reducers/root";

export type CloseableOutletsType =
    | typeof NOTIFICATIONS_OUTLET
    | typeof SETTINGS_OUTLET;

@Component({
    standalone: false,
    selector: "electron-mail-app",
    styleUrls: ["./app.component.scss"],
    template: `
        <router-outlet name="${ACCOUNTS_OUTLET}"></router-outlet>
        <router-outlet name="${SETTINGS_OUTLET}"></router-outlet>
        <router-outlet name="${NOTIFICATIONS_OUTLET}"></router-outlet>
        <router-outlet name="${STUB_OUTLET}"></router-outlet>
    `,
})
export class AppComponent {
    private location = inject(Location);
    private store = inject<Store<State>>(Store);

    private closeableOutlets: CloseableOutletsType[] = [
        NOTIFICATIONS_OUTLET,
        SETTINGS_OUTLET,
    ];

    constructor() {
        setTheme("bs4");
    }

    @HostListener("document:keyup", ["$event"])
    onKeyUp({key}: KeyboardEvent): void {
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

    private closeOutlet(outlet: CloseableOutletsType): void {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({path: [{outlets: {[outlet]: null}}]}));
    }
}
