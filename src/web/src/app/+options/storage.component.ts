import {map} from "rxjs/operators";
import {Component} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {OptionsActions} from "_web_app/store/actions";
import {progressSelector, State} from "_web_app/store/reducers/options";
import {ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "_shared/model/options";

@Component({
    selector: `protonmail-desktop-app-storage`,
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
    changingPassword$ = this.store.select(progressSelector)
        .pipe(map(({changingPassword}) => changingPassword));
    reEncryptingSettings$ = this.store.select(progressSelector)
        .pipe(map(({reEncryptingSettings}) => reEncryptingSettings));

    constructor(private store: Store<State>) {}

    submit() {
        this.store.dispatch(new OptionsActions.ChangeMasterPasswordRequest({
            password: this.password.value,
            newPassword: this.newPassword.value,
        }));
    }

    submitPresets() {
        const keyDerivation = KEY_DERIVATION_PRESETS[this.encryptionPresetForm.controls.keyDerivation.value];
        const encryption = ENCRYPTION_DERIVATION_PRESETS[this.encryptionPresetForm.controls.encryption.value];
        const encryptionPreset = {keyDerivation, encryption};

        this.store.dispatch(new OptionsActions.ReEncryptSettings(
            this.encryptionPresetForm.controls.password.value,
            encryptionPreset,
        ));
    }
}
