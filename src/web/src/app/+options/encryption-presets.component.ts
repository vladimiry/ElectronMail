import {map, takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";
import {Component, Input, OnDestroy, OnInit} from "@angular/core";
import {FormGroup} from "@angular/forms";
import {Store} from "@ngrx/store";

import {ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "_@shared/model/options";
import {configSelector, State} from "_@web/src/app/store/reducers/options";

@Component({
    selector: `email-securely-app-encryption-presets`,
    templateUrl: "./encryption-presets.component.html",
    preserveWhitespaces: true,
})
export class EncryptionPresetsComponent implements OnInit, OnDestroy {
    config$ = this.store.select(configSelector);
    unSubscribe$ = new Subject();
    keyDerivation = KEY_DERIVATION_PRESETS;
    keyDerivationTitles = Object.keys(this.keyDerivation);
    encryption = ENCRYPTION_DERIVATION_PRESETS;
    encryptionTitles = Object.keys(this.encryption);
    @Input()
    formGroup: FormGroup;

    constructor(private store: Store<State>) {}

    ngOnInit() {
        this.config$
            .pipe(
                map(({encryptionPreset}) => encryptionPreset),
                takeUntil(this.unSubscribe$),
            )
            .subscribe((encryptionPreset) => {
                const keyDerivation = encryptionPreset.keyDerivation;
                const encryption = encryptionPreset.encryption;
                const keyDerivationEntry = Object
                    .entries(KEY_DERIVATION_PRESETS)
                    .find(([title, value]) => value.type === keyDerivation.type && value.preset === keyDerivation.preset);
                const encryptionEntry = Object
                    .entries(ENCRYPTION_DERIVATION_PRESETS)
                    .find(([title, value]) => value.type === encryption.type && value.preset === encryption.preset);

                if (!keyDerivationEntry || !encryptionEntry) {
                    throw new Error(`"keyDerivationEntry/encryptionEntry" pair is not defined`);
                }

                if (!this.formGroup.controls.keyDerivation || !this.formGroup.controls.encryption) {
                    throw new Error(`"keyDerivation/encryption" controls pair is not defined`);
                }

                this.formGroup.controls.keyDerivation.patchValue(keyDerivationEntry[0]);
                this.formGroup.controls.encryption.patchValue(encryptionEntry[0]);
            });
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
