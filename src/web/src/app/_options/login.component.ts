import {Component, OnInit} from "@angular/core";
import {FormGroup} from "@angular/forms";
import {Store, select} from "@ngrx/store";
import {filter, mergeMap, take, takeUntil} from "rxjs/operators";

import {LoginBaseComponent} from "./login-base.component";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-login",
    templateUrl: "./login.component.html",
    styleUrls: ["./login.component.scss"],
    preserveWhitespaces: true,
})
export class LoginComponent extends LoginBaseComponent implements OnInit {
    form = new FormGroup({
        password: this.password,
        savePassword: this.savePassword,
    });

    constructor(
        store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit() {
        super.ngOnInit();

        this.keytarSupport$
            .pipe(
                filter(Boolean),
                take(1),
                mergeMap(() => {
                    return this.store.pipe(
                        select(OptionsSelectors.FEATURED.hasSavedPassword),
                        filter(Boolean),
                        take(1),
                    );
                }),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(() => this.store.dispatch(OPTIONS_ACTIONS.SignInRequest({})));
    }
}
