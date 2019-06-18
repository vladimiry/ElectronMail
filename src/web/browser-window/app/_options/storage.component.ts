import {Component} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";
import {map} from "rxjs/operators";

import {ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "src/shared/model/options";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-storage",
    templateUrl: "./storage.component.html",
    styleUrls: ["./storage.component.scss"],
    preserveWhitespaces: true,
})
export class StorageComponent {
    password = new FormControl(null, Validators.required);
    newPassword = new FormControl(null, Validators.required);
    newPasswordConfirm = new FormControl(null, [
        Validators.required,
        // TODO make "controls match" to be "common/util" validator
        () => {
            if (this.newPassword
                && this.newPasswordConfirm
                && this.newPassword.value !== this.newPasswordConfirm.value) {
                return {mismatch: true};
            }

            return null;
        },
    ]);
    form = new FormGroup({
        password: this.password,
        newPassword: this.newPassword,
        newPasswordConfirm: this.newPasswordConfirm,
    });
    encryptionPresetForm = new FormGroup({
        password: new FormControl(null, Validators.required),
        keyDerivation: new FormControl(null, Validators.required),
        encryption: new FormControl(null, Validators.required),
    });
    changingPassword$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.changingPassword));
    reEncryptingSettings$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.reEncryptingSettings));

    constructor(private store: Store<State>) {}

    submit() {
        this.store.dispatch(OPTIONS_ACTIONS.ChangeMasterPasswordRequest({
            password: this.password.value,
            newPassword: this.newPassword.value,
        }));
    }

    submitPresets() {
        const keyDerivation = KEY_DERIVATION_PRESETS[this.encryptionPresetForm.controls.keyDerivation.value];
        const encryption = ENCRYPTION_DERIVATION_PRESETS[this.encryptionPresetForm.controls.encryption.value];
        const encryptionPreset = {keyDerivation, encryption};

        this.store.dispatch(OPTIONS_ACTIONS.ReEncryptSettings({
            password: this.encryptionPresetForm.controls.password.value,
            encryptionPreset,
        }));
    }
}
