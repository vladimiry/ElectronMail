import {Component} from "@angular/core";
import {Store} from "@ngrx/store";

import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-keepass-associate-settings",
    templateUrl: "./keepass-associate-settings.component.html",
})
export class KeepassAssociateSettingsComponent {
    keePassClientConf$ = this.store.select(OptionsSelectors.SETTINGS.keePassClientConf);

    constructor(private store: Store<State>) {}
}
