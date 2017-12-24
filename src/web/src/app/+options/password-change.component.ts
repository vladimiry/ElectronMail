import {map} from "rxjs/operators";
import {Component} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";
import {OptionsActions} from "_web_app/store/actions";
import {progressSelector, State} from "_web_app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-password-change`,
    templateUrl: "./password-change.component.html",
    styleUrls: ["./password-change.component.scss"],
    preserveWhitespaces: true,
})
export class PasswordChangeComponent {
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
    processing$ = this.store.select(progressSelector)
        .pipe(map(({changingPassword}) => changingPassword));

    constructor(private store: Store<State>) {}

    submit() {
        this.store.dispatch(new OptionsActions.ChangeMasterPasswordRequest({
            password: this.password.value,
            newPassword: this.newPassword.value,
        }));
    }
}
