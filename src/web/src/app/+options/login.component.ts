import {filter, map, take} from "rxjs/operators";
import {AfterViewInit, Component, ElementRef, OnInit, QueryList, ViewChildren} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-login",
    templateUrl: "./login.component.html",
    styleUrls: ["./login.component.scss"],
    preserveWhitespaces: true,
})
export class LoginComponent implements AfterViewInit, OnInit {
    password = new FormControl(null, Validators.required);
    savePassword = new FormControl(false);
    form = new FormGroup({
        password: this.password,
        savePassword: this.savePassword,
    });
    processing$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.signingIn));
    @ViewChildren("passwordRef")
    passwordElementRefQuery!: QueryList<ElementRef>;

    constructor(private store: Store<State>) {}

    ngOnInit() {
        this.store.select(OptionsSelectors.FEATURED.hasSavedPassword)
            .pipe(
                filter((value) => !!value),
                take(1),
            )
            .subscribe(() => this.store.dispatch(OPTIONS_ACTIONS.SignInRequest({})));
    }

    ngAfterViewInit() {
        if (this.passwordElementRefQuery.length) {
            this.passwordElementRefQuery.first.nativeElement.focus();
        }
    }

    quit() {
        this.store.dispatch(NAVIGATION_ACTIONS.Quit());
    }

    submit() {
        this.store.dispatch(OPTIONS_ACTIONS.SignInRequest({
            password: String(this.password.value),
            savePassword: Boolean(this.savePassword.value),
        }));
    }
}
