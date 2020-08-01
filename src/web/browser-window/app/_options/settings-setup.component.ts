import {Component, Injector} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";

import {LoginBaseComponent} from "src/web/browser-window/app/_options/login-base.component";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";

@Component({
    selector: "electron-mail-settings-setup",
    templateUrl: "./settings-setup.component.html",
    styleUrls: ["./settings-setup.component.scss"],
    preserveWhitespaces: true,
})
export class SettingsSetupComponent extends LoginBaseComponent {
    passwordConfirm = new FormControl(null, [
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        // TODO make "controls match" to be "common/util" validator
        () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
            if (this.password
                && this.passwordConfirm
                && this.password.value !== this.passwordConfirm.value) {
                return {mismatch: true};
            }

            return null;
        },
    ]);

    form = new FormGroup({
        savePassword: this.savePassword,
        password: this.password,
        passwordConfirm: this.passwordConfirm,
    });

    constructor(
        injector: Injector,
    ) {
        super(injector);
    }

    openSettingsFolder(): void {
        this.store.dispatch(
            NAVIGATION_ACTIONS.OpenSettingsFolder(),
        );
    }

    openFaq(): void {
        this.store.dispatch(
            NAVIGATION_ACTIONS.OpenExternal({url: "https://github.com/vladimiry/ElectronMail/wiki/FAQ"}),
        );
    }
}
