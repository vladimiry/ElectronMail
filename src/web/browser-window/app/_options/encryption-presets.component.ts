import {Component, Input} from "@angular/core";
import {FormGroup} from "@angular/forms";
import {map, takeUntil} from "rxjs/operators";
import {Observable, Subject} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";

import {Config, ENCRYPTION_DERIVATION_PRESETS, KEY_DERIVATION_PRESETS} from "src/shared/model/options";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-encryption-presets",
    templateUrl: "./encryption-presets.component.html",
    preserveWhitespaces: true,
})
export class EncryptionPresetsComponent implements OnInit, OnDestroy {
    readonly config$: Observable<Config>;
    readonly unSubscribe$ = new Subject();
    readonly keyDerivation = KEY_DERIVATION_PRESETS;
    readonly keyDerivationTitles = Object.keys(this.keyDerivation);
    readonly encryption = ENCRYPTION_DERIVATION_PRESETS;
    readonly encryptionTitles = Object.keys(this.encryption);
    @Input({required: true})
    formGroup!: FormGroup;

    constructor(private store: Store<State>) {
        this.config$ = this.store.select(OptionsSelectors.FEATURED.config);
    }

    ngOnInit(): void {
        this.config$
            .pipe(
                map(({encryptionPreset}) => encryptionPreset),
                takeUntil(this.unSubscribe$),
            )
            .subscribe((encryptionPreset) => {
                const {keyDerivation, encryption} = encryptionPreset;
                const keyDerivationEntry = Object
                    .entries(KEY_DERIVATION_PRESETS)
                    .find(([, value]) => value.type === keyDerivation.type && value.preset === keyDerivation.preset);
                const encryptionEntry = Object
                    .entries(ENCRYPTION_DERIVATION_PRESETS)
                    .find(([, value]) => value.type === encryption.type && value.preset === encryption.preset);

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

    ngOnDestroy(): void {
        this.unSubscribe$.next(void 0);
        this.unSubscribe$.complete();
    }
}
