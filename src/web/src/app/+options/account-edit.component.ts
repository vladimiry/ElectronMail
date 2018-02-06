import {map, merge, mergeMap, switchMap, takeUntil, withLatestFrom} from "rxjs/operators";
import {Observable} from "rxjs/Observable";
import {Subject} from "rxjs/Subject";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {of} from "rxjs/observable/of";
import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Store} from "@ngrx/store";

import {AccountConfig, AccountCredentials} from "_shared/model/account";
import {AccountConfigPatch} from "_shared/model/container";
import {KeePassRef} from "_shared/model/keepasshttp";
import {OptionsActions} from "_web_app/store/actions";
import {progressSelector, settingsAccountByLoginSelector, settingsKeePassClientConfSelector, State} from "_web_app/store/reducers/options";
import {OptionsService} from "./options.service";

type optionalAccount = AccountConfig | undefined;
type optionalString = string | undefined;

// TODO simplify RxJS stuff of the "account-edit.component"
// for example "optionalAccount"/"optionalString" stuff looks weird
@Component({
    selector: `protonmail-desktop-app-account-edit`,
    templateUrl: "./account-edit.component.html",
    styleUrls: ["./account-edit.component.scss"],
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, AfterViewInit, OnDestroy {
    // form
    login = new FormControl(null, Validators.required);
    password = new FormControl(null);
    twoFactorCode = new FormControl(null);
    mailPassword = new FormControl(null);
    form = new FormGroup({
        login: this.login,
        password: this.password,
        twoFactorCode: this.twoFactorCode,
        mailPassword: this.mailPassword,
    });

    // account
    updatingAccountLogin$: Subject<string> = new Subject();
    accountLogin$: Observable<string> = this.activatedRoute.params.pipe(
        map(({login}) => login),
        merge(this.updatingAccountLogin$),
        mergeMap((login) => login ? [login] : []),
    );
    removingAccountLogin$: BehaviorSubject<optionalString> = new BehaviorSubject(undefined as optionalString);
    account$: BehaviorSubject<optionalAccount> = new BehaviorSubject(undefined as optionalAccount);
    passwordKeePassRef$ = this.account$
        .pipe(map((account) => account && account.credentials && account.credentials.password.keePassRef));
    mailPasswordKeePassRef$ = this.account$
        .pipe(map((account) => account && account.credentials && account.credentials.mailPassword.keePassRef));
    // progress
    processing$ = this.store.select(progressSelector)
        .pipe(map(({addingAccount, updatingAccount, removingAccount}) => addingAccount || updatingAccount));
    removing$ = this.store.select(progressSelector)
        .pipe(map(({removingAccount}) => removingAccount));
    // keepass
    keePassRefCollapsed = true;
    keePassClientConf$ = this.store.select(settingsKeePassClientConfSelector);
    // other
    @ViewChildren("loginRef")
    loginElementRefQuery: QueryList<ElementRef>;
    unSubscribe$ = new Subject();

    constructor(private optionsService: OptionsService,
                private store: Store<State>,
                private activatedRoute: ActivatedRoute) {}

    ngOnInit() {
        this.accountLogin$
            .pipe(
                switchMap((login) =>
                    this.store.select(settingsAccountByLoginSelector(login))
                        .pipe(withLatestFrom(of(login))),
                ),
                takeUntil(this.unSubscribe$),
            )
            .subscribe(([account, login]) => {
                if (account) {
                    this.account$.next(account);
                    this.form.removeControl("login");
                    this.password.patchValue(account.credentials.password.value);
                    if (account.credentials.twoFactorCode) {
                        this.twoFactorCode.patchValue(account.credentials.twoFactorCode.value);
                    }
                    this.mailPassword.patchValue(account.credentials.mailPassword.value);
                } else if (login === this.removingAccountLogin$.getValue()) {
                    this.store.dispatch(this.optionsService.buildNavigationAction({path: "accounts"}));
                }
            });
    }

    ngAfterViewInit() {
        if (this.loginElementRefQuery.length) {
            this.loginElementRefQuery.first.nativeElement.focus();
        }
    }

    submit() {
        const account = this.account$.getValue();
        const patch: AccountConfigPatch = {
            login: account ? account.login : this.login.value,
            passwordValue: this.password.value,
            twoFactorCodeValue: this.twoFactorCode.value,
            mailPasswordValue: this.mailPassword.value,
        };

        this.updatingAccountLogin$.next(patch.login);

        this.store.dispatch(
            account
                ? new OptionsActions.UpdateAccountRequest(patch)
                : new OptionsActions.AddAccountRequest(patch),
        );
    }

    remove() {
        const account = this.account$.getValue();

        if (!account) {
            throw new Error("No \"Account\" to remove");
        }

        if (!confirm(`Please confirm "${account.login}" account removing!`)) {
            return;
        }

        this.removingAccountLogin$.next(account.login);

        this.store.dispatch(new OptionsActions.RemoveAccountRequest(account.login));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }

    onPasswordKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("password", keePassRef);
    }

    onPasswordKeePassUnlink() {
        this.dispatchKeePassRefUpdate("password", null);
    }

    onMailPasswordKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("mailPassword", keePassRef);
    }

    onMailPasswordKeePassUnlink() {
        this.dispatchKeePassRefUpdate("mailPassword", null);
    }

    private dispatchKeePassRefUpdate(passwordType: keyof AccountCredentials, keePassRef: KeePassRef | null) {
        const account = this.account$.getValue();

        if (!account) {
            throw new Error("No \"Account\" to link/unlink KeePass record with");
        }

        this.store.dispatch(
            new OptionsActions.UpdateAccountRequest({
                login: account.login,
                [passwordType === "password" ? "passwordKeePassRef" : "mailPasswordKeePassRef"]: keePassRef,
            }),
        );
    }
}
