import type {AfterViewInit, OnDestroy} from "@angular/core";
import {Directive, ElementRef, Injector, QueryList, ViewChildren} from "@angular/core";
import {FormControl, Validators} from "@angular/forms";
import {Observable, Subscription} from "rxjs";
import {Store, select} from "@ngrx/store";
import {filter, map, pairwise} from "rxjs/operators";

import {NOTIFICATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {SAVE_PASSWORD_WARN_TRUSTED_HTML} from "./const";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class LoginBaseComponent implements AfterViewInit, OnDestroy {
    readonly password = new FormControl(
        null,
        Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
    );

    readonly savePassword = new FormControl(false);

    @ViewChildren("passwordRef")
    passwordElementRefQuery!: QueryList<ElementRef>;

    protected readonly store = this.injector.get<Store<State>>(Store);

    readonly signingIn$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.signingIn)),
    );

    readonly loadingDatabase$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.loadingDatabase)),
    );

    protected readonly subscription = new Subscription();

    constructor(
        protected injector: Injector,
    ) {
        this.subscription.add(
            this.store.pipe(
                select(OptionsSelectors.FEATURED.keytarSupport),
            ).subscribe((value) => {
                this.savePassword[value ? "enable" : "disable"]();
            }),
        );

        this.enableMasterPasswordWarning();
    }

    ngAfterViewInit(): void {
        if (this.passwordElementRefQuery.length) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.passwordElementRefQuery.first.nativeElement.focus();
        }
    }

    submit(): void {
        this.store.dispatch(OPTIONS_ACTIONS.SignInRequest({
            password: String(this.password.value),
            savePassword: Boolean(this.savePassword.value),
        }));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private enableMasterPasswordWarning(): void {
        this.subscription.add(
            this.savePassword.valueChanges.pipe(
                pairwise(),
                filter(([prev, curr]) => Boolean(curr) && Boolean(curr) !== Boolean(prev)),
            ).subscribe(() => {
                this.store.dispatch(
                    NOTIFICATION_ACTIONS.Message({message: SAVE_PASSWORD_WARN_TRUSTED_HTML, style: "warning", html: true}),
                );
            }),
        );

        // making sure "pairwise()" to be triggered on first value changing to "true"
        this.savePassword.patchValue(this.savePassword.value);
    }
}
