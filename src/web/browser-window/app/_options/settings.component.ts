import {Component} from "@angular/core";
import {Store} from "@ngrx/store";

import {OptionsService} from "./options.service";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    standalone: false,
    selector: "electron-mail-settings",
    templateUrl: "./settings.component.html",
    styleUrls: ["./settings.component.scss"],
})
export class SettingsComponent {
    constructor(private optionsService: OptionsService, private store: Store<State>) {}

    close(): void {
        this.store.dispatch(this.optionsService.settingsNavigationAction());
    }
}
