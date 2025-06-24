import {Component, inject} from "@angular/core";
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
    private optionsService = inject(OptionsService);
    private store = inject<Store<State>>(Store);

    close(): void {
        this.store.dispatch(this.optionsService.settingsNavigationAction());
    }
}
