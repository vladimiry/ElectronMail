import {Component} from "@angular/core";

import {ACCOUNTS_OUTLET, ERRORS_OUTLET, SETTINGS_OUTLET} from "_web_app/app.constants";

@Component({
    selector: `protonmail-desktop-app-app`,
    template: `
        <router-outlet name="${ACCOUNTS_OUTLET}"></router-outlet>
        <router-outlet name="${SETTINGS_OUTLET}"></router-outlet>
        <router-outlet name="${ERRORS_OUTLET}"></router-outlet>
    `,
    styleUrls: ["./app.component.scss"],
})
export class AppComponent {}
