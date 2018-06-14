import {filter, map, take} from "rxjs/operators";
import {AfterViewInit, Component, ElementRef, OnInit, QueryList, ViewChildren} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {NavigationActions, OptionsActions} from "_web_src/app/store/actions";
import {hasSavedPasswordSelector, progressSelector, State} from "_web_src/app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-login`,
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
    processing$ = this.store.select(progressSelector).pipe(map(({signingIn}) => signingIn));
    @ViewChildren("passwordRef")
    passwordElementRefQuery: QueryList<ElementRef>;

    constructor(private store: Store<State>) {}

    ngOnInit() {
        this.store.select((hasSavedPasswordSelector))
            .pipe(
                filter((value) => !!value),
                take(1),
            )
            .subscribe(() => this.store.dispatch(new OptionsActions.GetSettingsAutoRequest()));
    }

    ngAfterViewInit() {
        if (this.passwordElementRefQuery.length) {
            this.passwordElementRefQuery.first.nativeElement.focus();
        }
    }

    quit() {
        this.store.dispatch(new NavigationActions.Quit());
    }

    submit() {
        this.store.dispatch(new OptionsActions.SignInRequest({
            password: String(this.password.value),
            savePassword: Boolean(this.savePassword.value),
        }));
    }
}
