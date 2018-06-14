import {map} from "rxjs/operators";
import {AfterViewInit, Component, ElementRef, QueryList, ViewChildren} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {OptionsActions} from "_web_src/app/store/actions";
import {progressSelector, State} from "_web_src/app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-settings-setup`,
    templateUrl: "./settings-setup.component.html",
    styleUrls: ["./settings-setup.component.scss"],
    preserveWhitespaces: true,
})
export class SettingsSetupComponent implements AfterViewInit {
    savePassword = new FormControl(false);
    password = new FormControl(null, Validators.required);
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
    processing$ = this.store.select(progressSelector)
        .pipe(map(({signingIn}) => signingIn));
    @ViewChildren("passwordRef")
    passwordElementRefQuery: QueryList<ElementRef>;

    constructor(private store: Store<State>) {}

    ngAfterViewInit() {
        if (this.passwordElementRefQuery.length) {
            this.passwordElementRefQuery.first.nativeElement.focus();
        }
    }

    submit() {
        this.store.dispatch(new OptionsActions.SignInRequest({
            password: String(this.password.value),
            savePassword: Boolean(this.savePassword.value),
        }));
    }
}
