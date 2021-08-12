import {Component, Injector} from "@angular/core";
import {FormGroup} from "@angular/forms";
import type {OnInit} from "@angular/core";
import {combineLatest} from "rxjs";
import {filter, take} from "rxjs/operators";
import {select} from "@ngrx/store";

import {LoginBaseComponent} from "src/web/browser-window/app/_options/login-base.component";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";

@Component({
    selector: "electron-mail-login",
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
        injector: Injector,
    ) {
        super(injector);
    }

    ngOnInit(): void {
        this.subscription.add(
            combineLatest([
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.keytarSupport),
                    filter(Boolean),
                ),
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.hasSavedPassword),
                    filter(Boolean),
                ),
            ]).pipe(
                take(1),
            ).subscribe(() => {
                this.store.dispatch(OPTIONS_ACTIONS.SignInRequest({}));
            }),
        );
    }
}
