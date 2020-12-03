import {Component} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Observable} from "rxjs";
import {Store} from "@ngrx/store";
import {map} from "rxjs/operators";

import {ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "src/shared/model/options";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-storage",
    templateUrl: "./storage.component.html",
    preserveWhitespaces: true,
})
export class StorageComponent {
    password = new FormControl(
        null,
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
    );
    newPassword = new FormControl(
        null,
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
    );
    newPasswordConfirm = new FormControl(null, [
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        // TODO make "controls match" to be "common/util" validator
        () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
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
        password: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        keyDerivation: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        encryption: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
    });
    changingPassword$: Observable<boolean> = this.store
        .select(OptionsSelectors.FEATURED.progress)
        .pipe(map((progress) => Boolean(progress.changingPassword)));
    reEncryptingSettings$: Observable<boolean> = this.store
        .select(OptionsSelectors.FEATURED.progress)
        .pipe(map((progress) => Boolean(progress.reEncryptingSettings)));

    constructor(private store: Store<State>) {}

    submit(): void {
        this.store.dispatch(OPTIONS_ACTIONS.ChangeMasterPasswordRequest({
            password: this.password.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            newPassword: this.newPassword.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        }));
    }

    submitPresets(): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const keyDerivation = KEY_DERIVATION_PRESETS[this.encryptionPresetForm.controls.keyDerivation?.value];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const encryption = ENCRYPTION_DERIVATION_PRESETS[this.encryptionPresetForm.controls.encryption?.value];

        if (!keyDerivation || !encryption) {
            throw new Error("Invalid keyDerivation/encryption values detected");
        }

        this.store.dispatch(OPTIONS_ACTIONS.ReEncryptSettings({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            password: this.encryptionPresetForm.controls.password?.value,
            encryptionPreset: {keyDerivation, encryption},
        }));
    }
}
