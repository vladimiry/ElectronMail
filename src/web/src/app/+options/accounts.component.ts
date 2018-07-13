import {Component} from "@angular/core";
import {Store} from "@ngrx/store";

import {settingsAccountsSelector, State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: `email-securely-app-accounts`,
    templateUrl: "./accounts.component.html",
})
export class AccountsComponent {
    accounts$ = this.store.select(settingsAccountsSelector);

    constructor(private store: Store<State>) {}
}
