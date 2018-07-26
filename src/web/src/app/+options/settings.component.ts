import {Component} from "@angular/core";
import {Store} from "@ngrx/store";

import {OptionsService} from "./options.service";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-settings",
    templateUrl: "./settings.component.html",
    styleUrls: ["./settings.component.scss"],
})
export class SettingsComponent {
    constructor(private optionsService: OptionsService,
                private store: Store<State>) {}

    close() {
        this.store.dispatch(this.optionsService.settingsNavigationAction());
    }
}
