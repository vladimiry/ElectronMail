import {Component} from "@angular/core";
import {Store} from "@ngrx/store";

import {settingsAccountsSelector, State} from "_web_src/app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-accounts`,
    templateUrl: "./accounts.component.html",
})
export class AccountsComponent {
    accounts$ = this.store.select(settingsAccountsSelector);

    constructor(private store: Store<State>) {}
}
