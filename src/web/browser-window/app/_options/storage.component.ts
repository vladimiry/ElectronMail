import {Component, inject} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {map} from "rxjs/operators";
import {Observable} from "rxjs";
import {Store} from "@ngrx/store";

import {ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "src/shared/model/options";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    standalone: false,
    selector: "electron-mail-storage",
    templateUrl: "./storage.component.html",
    preserveWhitespaces: true,
})
export class StorageComponent {
    private store = inject<Store<State>>(Store);

    password = new FormControl<string | null>(
        null,
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
    );
    newPassword = new FormControl<string | null>(
        null,
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
    );
    newPasswordConfirm = new FormControl<string | null>(null, [
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        // TODO make "controls match" to be "common/util" validator
        () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
            if (
                this.newPassword
                && this.newPasswordConfirm
                && this.newPassword.value !== this.newPasswordConfirm.value
            ) {
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
        password: new FormControl<string | null>(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        keyDerivation: new FormControl<string | null>(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        encryption: new FormControl<string | null>(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
    });
    changingPassword$: Observable<boolean>;
    reEncryptingSettings$: Observable<boolean>;

    constructor() {
        this.changingPassword$ = this.store
            .select(OptionsSelectors.FEATURED.progress)
            .pipe(map((progress) => Boolean(progress.changingPassword)));
        this.reEncryptingSettings$ = this.store
            .select(OptionsSelectors.FEATURED.progress)
            .pipe(map((progress) => Boolean(progress.reEncryptingSettings)));
    }

    submit(): void {
        const password = this.password.value;
        const newPassword = this.newPassword.value;
        if (!password || !newPassword) {
            throw new Error(`Empty values not allowed: ${nameof.full(password)}, ${nameof.full(newPassword)}`);
        }
        this.store.dispatch(OPTIONS_ACTIONS.ChangeMasterPasswordRequest({password, newPassword}));
    }

    submitPresets(): void {
        const keyDerivationPresetKey = this.encryptionPresetForm.controls.keyDerivation?.value;
        const encryptionFormPresetKey = this.encryptionPresetForm.controls.encryption?.value;
        if (!keyDerivationPresetKey || !encryptionFormPresetKey) {
            throw new Error(`Empty values not allowed: ${nameof(keyDerivationPresetKey)}, ${nameof(encryptionFormPresetKey)}`);
        }

        {
            const keyDerivation = KEY_DERIVATION_PRESETS[keyDerivationPresetKey];
            const encryption = ENCRYPTION_DERIVATION_PRESETS[encryptionFormPresetKey];
            const password = this.encryptionPresetForm.controls.password?.value;
            if (!keyDerivation || !encryption || !password) {
                throw new Error(`Empty values not allowed: ${nameof(keyDerivation)}, ${nameof(encryption)}, ${nameof(password)}`);
            }

            this.store.dispatch(OPTIONS_ACTIONS.ReEncryptSettings({
                password,
                encryptionPreset: {keyDerivation, encryption},
            }));
        }
    }
}
