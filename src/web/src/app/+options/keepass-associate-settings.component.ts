import {Component} from "@angular/core";
import {Store} from "@ngrx/store";

import {settingsKeePassClientConfSelector, State} from "_web_app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-keepass-associate-settings`,
    templateUrl: "./keepass-associate-settings.component.html",
})
export class KeepassAssociateSettingsComponent {
    keePassClientConf$ = this.store.select(settingsKeePassClientConfSelector);

    constructor(private store: Store<State>) {}
}
