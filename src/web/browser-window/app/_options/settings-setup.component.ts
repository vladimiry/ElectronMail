import {Component, Injector} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";

import {LoginBaseComponent} from "src/web/browser-window/app/_options/login-base.component";

@Component({
    selector: "electron-mail-settings-setup",
    templateUrl: "./settings-setup.component.html",
    styleUrls: ["./settings-setup.component.scss"],
    preserveWhitespaces: true,
})
export class SettingsSetupComponent extends LoginBaseComponent {
    passwordConfirm = new FormControl(null, [
        Validators.required,
        // TODO make "controls match" to be "common/util" validator
        () => {
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
}
